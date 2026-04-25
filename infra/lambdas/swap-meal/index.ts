import { randomUUID } from "node:crypto";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
	CompleteProfileForPlanSchema,
	GeneratedMealSwapCandidatesSchema,
	MealSchema,
	MealSwapApplyRequestSchema,
	MealSwapCandidatesRequestSchema,
	WeeklyPlanSchema,
} from "@fitness/contracts-ts";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { z } from "zod";

import { toSafePromptProfile } from "../generate-plan/mappers";
import { requireUserId } from "../shared/auth";
import { isConditionalCheckFailed } from "../shared/aws-errors";
import { toIsoDateString } from "../shared/brand";
import { systemClock } from "../shared/clock";
import { WeeklyPlanRowSchema } from "../shared/db-schemas";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { planKey } from "../shared/keys/plan";
import { consumeUserRateLimit } from "../shared/rate-limit";
import { ok, requireJsonBody, withServerError } from "../shared/response";
import {
	badGatewayJson,
	badRequestJson,
	errorJson,
	gatewayTimeoutJson,
	rateLimitedJson,
} from "../shared/response-json";
import { invokeSwapAgent } from "./agentcore-client";
import {
	areSwapCandidatesValid,
	buildDailyMacroContext,
	buildProposalItem,
	buildUpdatedPlanForSwap,
	findSwapTarget,
	isPlanStaleForProposal,
	isProposalExpired,
	pickSwapCandidate,
	toEpochSeconds,
	toIsoStringFromEpochSeconds,
} from "./swap-mappers";

const CANDIDATES_TIMEOUT_MS = 25_000;
const SWAP_CANDIDATES_RATE_LIMIT = {
	name: "swap-candidates",
	limit: 20,
	windowSeconds: 10 * 60,
} as const;

const SwapCandidatesEnvelopeSchema = z
	.object({
		generated_candidates: z.unknown(),
	})
	.strict();

const SwapProposalRowSchema = z
	.object({
		week_start: z.string(),
		date: z.string(),
		slot: MealSchema.shape.slot,
		current_plan_id: z.string(),
		expected_revision: z.number().int(),
		candidates: z.array(MealSchema),
		created_at: z.string(),
		ttl: z.number().int(),
	})
	.strict();

function proposalKey(userId: string, proposalId: string) {
	return {
		pk: `user#${userId}`,
		sk: `swap_proposal#${proposalId}`,
	};
}

function parsePersistedPlan(
	item: Record<string, unknown>,
): z.infer<typeof WeeklyPlanSchema> | null {
	const parsed = WeeklyPlanRowSchema.safeParse(stripKeys(item));
	if (!parsed.success) return null;
	const { updated_at: _updatedAt, ...plan } = parsed.data;
	return plan;
}

function parseSwapCandidatesEnvelope(
	raw: unknown,
): z.infer<typeof SwapCandidatesEnvelopeSchema> | null {
	const parsed = SwapCandidatesEnvelopeSchema.safeParse(raw);
	if (!parsed.success) return null;
	return parsed.data;
}

function parseProposalItem(
	item: Record<string, unknown>,
): z.infer<typeof SwapProposalRowSchema> | null {
	const parsed = SwapProposalRowSchema.safeParse(stripKeys(item));
	if (!parsed.success) return null;
	return parsed.data;
}

function parseGeneratedCandidates(
	raw: unknown,
	slot: z.infer<typeof MealSchema>["slot"],
): z.infer<typeof GeneratedMealSwapCandidatesSchema>["candidates"] | null {
	const wrapped = parseSwapCandidatesEnvelope(raw);
	if (wrapped === null) return null;

	const shapeParse = GeneratedMealSwapCandidatesSchema.strict().safeParse(
		wrapped.generated_candidates,
	);
	if (!shapeParse.success) return null;

	const { candidates } = shapeParse.data;
	return areSwapCandidatesValid(candidates, slot) ? candidates : null;
}

async function safeInvokeSwapCandidates(input: {
	safe_prompt_profile: ReturnType<typeof toSafePromptProfile>;
	target_meal: z.input<typeof MealSchema>;
	daily_context: ReturnType<typeof buildDailyMacroContext>;
}): Promise<
	| { ok: true; response: unknown }
	| { ok: false; reason: "timeout" | "upstream" }
> {
	try {
		const response = await invokeSwapAgent(
			{ swap_context: input },
			CANDIDATES_TIMEOUT_MS,
		);
		return { ok: true, response };
	} catch (err) {
		const name = err instanceof Error ? err.name : "unknown";
		console.error("agentcore invoke failed", { name });
		return {
			ok: false,
			reason: name === "AbortError" ? "timeout" : "upstream",
		};
	}
}

function mapSwapAgentFailure(
	reason: "timeout" | "upstream",
): APIGatewayProxyStructuredResultV2 {
	return reason === "timeout"
		? gatewayTimeoutJson({ error: "swap_timeout" })
		: badGatewayJson({ error: "agent_upstream_error" });
}

export async function handler(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const path = event.requestContext.http.path;
	if (path.endsWith("/swap-candidates")) {
		return withServerError("swap-candidates", () => handleCandidates(event));
	}
	if (path.endsWith("/swap-apply")) {
		return withServerError("swap-apply", () => handleApply(event));
	}
	return errorJson(404, { error: "not_found" });
}

async function handleCandidates(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const auth = requireUserId(event);
	if (!auth.ok) return auth.response;

	const weekStartParam = event.pathParameters?.weekStart;
	if (!weekStartParam) return badRequestJson({ error: "missing_week_start" });
	const weekStart = toIsoDateString(weekStartParam);
	if (!weekStart) return badRequestJson({ error: "invalid_week_start" });

	const parsedBody = requireJsonBody(event);
	if (!parsedBody.ok) return parsedBody.response;
	const reqParse = MealSwapCandidatesRequestSchema.safeParse(parsedBody.body);
	if (!reqParse.success) return badRequestJson({ error: "invalid_request" });
	const { date, slot } = reqParse.data;

	const [profileRes, planRes] = await Promise.all([
		docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: { pk: `user#${auth.userId}`, sk: "profile" },
				ConsistentRead: true,
			}),
		),
		docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: planKey(auth.userId, weekStart),
				ConsistentRead: true,
			}),
		),
	]);

	if (!profileRes.Item)
		return errorJson(400, { error: "onboarding_incomplete" });
	const profileParse = CompleteProfileForPlanSchema.safeParse(
		stripKeys(profileRes.Item),
	);
	if (!profileParse.success) {
		return errorJson(400, { error: "incomplete_profile_fields" });
	}

	if (!planRes.Item) return errorJson(404, { error: "plan_not_found" });
	const plan = parsePersistedPlan(planRes.Item);
	if (plan === null) {
		return badGatewayJson({ error: "invalid_plan_shape" });
	}

	const target = findSwapTarget(plan, date, slot);
	if (target === null) return errorJson(404, { error: "meal_not_found" });

	const nowSec = toEpochSeconds(systemClock.now());
	const rateLimit = await consumeUserRateLimit({
		userId: auth.userId,
		rule: SWAP_CANDIDATES_RATE_LIMIT,
		nowEpochSeconds: nowSec,
	});
	if (!rateLimit.allowed) {
		return rateLimitedJson(rateLimit.retryAfterSeconds);
	}

	// SafePromptProfile + DailyMacroContext を組み立て
	const safeProfile = toSafePromptProfile(profileParse.data);
	const dailyContext = buildDailyMacroContext(plan, date, slot);

	const invokeResult = await safeInvokeSwapCandidates({
		safe_prompt_profile: safeProfile,
		target_meal: target.meal,
		daily_context: dailyContext,
	});
	if (!invokeResult.ok) {
		return mapSwapAgentFailure(invokeResult.reason);
	}

	const candidates = parseGeneratedCandidates(invokeResult.response, slot);
	if (candidates === null) {
		return badGatewayJson({ error: "invalid_swap_shape" });
	}

	// proposal を DDB に保存
	const proposalId = randomUUID();
	const proposalItem = buildProposalItem({
		userId: auth.userId,
		proposalId,
		weekStart,
		date,
		slot,
		plan,
		candidates,
		nowEpochSeconds: nowSec,
	});
	try {
		await docClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: proposalItem,
				ConditionExpression: "attribute_not_exists(pk)",
			}),
		);
	} catch (err) {
		console.error("proposal put failed", err);
		return badGatewayJson({ error: "proposal_persistence_failed" });
	}

	return ok({
		proposal_id: proposalId,
		proposal_expires_at: toIsoStringFromEpochSeconds(proposalItem.ttl),
		candidates,
	});
}

async function handleApply(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const auth = requireUserId(event);
	if (!auth.ok) return auth.response;

	const weekStartParam = event.pathParameters?.weekStart;
	if (!weekStartParam) return badRequestJson({ error: "missing_week_start" });
	const weekStart = toIsoDateString(weekStartParam);
	if (!weekStart) return badRequestJson({ error: "invalid_week_start" });

	const parsedBody = requireJsonBody(event);
	if (!parsedBody.ok) return parsedBody.response;
	const reqParse = MealSwapApplyRequestSchema.safeParse(parsedBody.body);
	if (!reqParse.success) return badRequestJson({ error: "invalid_request" });
	const { proposal_id, chosen_index } = reqParse.data;

	const [propRes, planRes] = await Promise.all([
		docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: proposalKey(auth.userId, proposal_id),
				ConsistentRead: true,
			}),
		),
		docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: planKey(auth.userId, weekStart),
				ConsistentRead: true,
			}),
		),
	]);

	if (!propRes.Item) {
		return errorJson(404, { error: "proposal_expired_or_missing" });
	}
	const proposal = parseProposalItem(propRes.Item);
	if (proposal === null) {
		return badGatewayJson({ error: "invalid_swap_shape" });
	}
	const nowSec = toEpochSeconds(systemClock.now());
	if (isProposalExpired(proposal.ttl, nowSec)) {
		return errorJson(410, { error: "proposal_expired" });
	}

	const chosen = pickSwapCandidate(proposal.candidates, chosen_index);
	if (chosen === null) {
		return badRequestJson({ error: "invalid_chosen_index" });
	}

	if (!planRes.Item) return errorJson(404, { error: "plan_not_found" });
	const plan = parsePersistedPlan(planRes.Item);
	if (plan === null) {
		return badGatewayJson({ error: "invalid_plan_shape" });
	}

	if (isPlanStaleForProposal(plan, proposal)) {
		return errorJson(409, { error: "plan_stale" });
	}

	const updatedPlan = buildUpdatedPlanForSwap(
		plan,
		proposal.date,
		proposal.slot,
		chosen,
	);
	if (updatedPlan === null) return errorJson(404, { error: "meal_not_found" });

	const newPlanParse = WeeklyPlanSchema.strict().safeParse(
		updatedPlan.updatedPlan,
	);
	if (!newPlanParse.success) {
		return badGatewayJson({ error: "invalid_plan_shape" });
	}

	// Optimistic concurrency write: plan_id + revision 一致時だけ更新
	try {
		await docClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: {
					...planKey(auth.userId, weekStart),
					...newPlanParse.data,
					updated_at: toIsoStringFromEpochSeconds(nowSec),
				},
				ConditionExpression:
					"plan_id = :pid AND (revision = :rev OR attribute_not_exists(revision))",
				ExpressionAttributeValues: {
					":pid": plan.plan_id,
					":rev": plan.revision,
				},
			}),
		);
	} catch (err) {
		if (isConditionalCheckFailed(err)) {
			return errorJson(409, { error: "plan_stale" });
		}
		console.error("ddb put failed", err);
		return badGatewayJson({ error: "persistence_failed" });
	}

	// one-shot 消費: proposal を削除 (失敗しても revision monotonicity で再 apply は 409 になる)
	try {
		await docClient.send(
			new DeleteCommand({
				TableName: TABLE_NAME,
				Key: proposalKey(auth.userId, proposal_id),
			}),
		);
	} catch (err) {
		console.warn("proposal delete failed (non-fatal)", err);
	}

	return ok({
		updated_day: updatedPlan.updatedDay,
		plan_id: plan.plan_id,
		revision: newPlanParse.data.revision,
	});
}

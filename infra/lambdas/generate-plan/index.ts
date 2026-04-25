import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import {
	type CompleteProfileForPlan,
	CompleteProfileForPlanSchema,
	GeneratedWeeklyPlanSchema,
	GeneratePlanRequestSchema,
	type WeeklyPlanSchema,
} from "@fitness/contracts-ts";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { z } from "zod";
import { requireUserId } from "../shared/auth";
import { isConditionalCheckFailed } from "../shared/aws-errors";
import type { IsoDateString, UserId } from "../shared/brand";
import { toIsoDateString } from "../shared/brand";
import { systemClock } from "../shared/clock";
import { WeeklyPlanRowSchema } from "../shared/db-schemas";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { planKey } from "../shared/keys/plan";
import { consumeUserRateLimit } from "../shared/rate-limit";
import {
	badRequest,
	ok,
	requireJsonBody,
	withServerError,
} from "../shared/response";
import {
	badGatewayJson,
	badRequestJson,
	gatewayTimeoutJson,
	rateLimitedJson,
} from "../shared/response-json";
import { type InvokePayload, invokeAgent } from "./agentcore-client";
import { toSafeAgentInput, toSafePromptProfile } from "./mappers";

const TIMEOUT_MS = 110_000;
const GENERATE_PLAN_RATE_LIMIT = {
	name: "generate-plan",
	limit: 3,
	windowSeconds: 60 * 60,
} as const;

// ---- Pure Core helpers --------------------------------------------------

/**
 * Profile から AgentCore invoke payload を組み立てる。mapper の Zod parse 失敗を
 * Result にたたむことで handler 側の try/catch / let を排除する。
 */
export function buildPayload(
	userId: UserId,
	weekStart: string,
	profile: CompleteProfileForPlan,
): { ok: true; payload: InvokePayload } | { ok: false; error: unknown } {
	try {
		return {
			ok: true,
			payload: {
				user_id: userId,
				week_start: weekStart,
				safe_prompt_profile: toSafePromptProfile(profile),
				safe_agent_input: toSafeAgentInput(profile),
			},
		};
	} catch (error) {
		return { ok: false, error };
	}
}

/**
 * AgentCore invoke エラーを HTTP response に写像する純粋関数。
 * AbortError / TimeoutError は 504、他は 502。分岐を handler 外でテストできる。
 */
export function mapAgentCoreError(
	err: unknown,
): APIGatewayProxyStructuredResultV2 {
	if (
		err instanceof Error &&
		(err.name === "AbortError" || err.name === "TimeoutError")
	) {
		return gatewayTimeoutJson({ error: "generation_timeout" });
	}
	return badGatewayJson({ error: "agentcore_failed" });
}

/**
 * GeneratedWeeklyPlan に Adapter 発行のメタ (plan_id / week_start / generated_at)
 * を付与して WeeklyPlan を組み立てる純粋関数。randomUUID / new Date は呼び出し側で。
 *
 * 型は contracts-ts の `WeeklyPlan` interface ではなく Zod 由来の infer を使う。
 * 理由: `.min(7).max(7)` などが JSON-Schema → TS 変換で tuple に変換されるが、
 * Zod runtime は DayPlan[] を返すため infer と interface がずれる。Zod 側を
 * source of truth にする。
 */
export function assembleWeeklyPlan(
	generated: z.infer<typeof GeneratedWeeklyPlanSchema>,
	meta: {
		plan_id: string;
		week_start: string;
		generated_at: string;
	},
): z.infer<typeof WeeklyPlanSchema> {
	// Plan 09: revision は swap のたびに +1 される monotonic counter。新規 plan は 0。
	// plan_id / generated_at と同じく Strands には渡さず adapter 側で付与する。
	return { ...generated, ...meta, revision: 0 };
}

// ---- Impure Shell wrappers ----------------------------------------------

async function safeInvokeAgent(
	payload: InvokePayload,
): Promise<
	| { ok: true; response: unknown }
	| { ok: false; errorResponse: APIGatewayProxyStructuredResultV2 }
> {
	try {
		const response = await invokeAgent(payload, TIMEOUT_MS);
		return { ok: true, response };
	} catch (err) {
		console.error("agentcore invoke failed", {
			name: err instanceof Error ? err.name : typeof err,
		});
		return { ok: false, errorResponse: mapAgentCoreError(err) };
	}
}

// ---- Handler ------------------------------------------------------------

export async function handler(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const auth = requireUserId(event);
	if (!auth.ok) return auth.response;

	const parsedBody = requireJsonBody(event);
	if (!parsedBody.ok) return parsedBody.response;
	const req = GeneratePlanRequestSchema.safeParse(parsedBody.body);
	if (!req.success) return badRequest("invalid request body");
	const { week_start, force_regenerate } = req.data;

	const weekStartBranded = toIsoDateString(week_start);
	if (!weekStartBranded) return badRequest("invalid week_start format");

	return withServerError("generatePlan", async () => {
		const profileResp = await docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: { pk: `user#${auth.userId}`, sk: "profile" },
				ConsistentRead: true,
			}),
		);
		if (!profileResp.Item) return badRequest("profile not found");

		const stripped = stripKeys(profileResp.Item);
		const profileParse = CompleteProfileForPlanSchema.safeParse(stripped);
		if (!profileParse.success) {
			if (stripped.onboarding_stage !== "complete") {
				return badRequestJson({ error: "onboarding_incomplete" });
			}
			return badRequestJson({ error: "incomplete_profile_fields" });
		}
		const profile = profileParse.data;

		if (!force_regenerate) {
			const existing = await readExistingPlan(auth.userId, weekStartBranded);
			if (existing !== null) return ok(existing);
		}

		const rateLimit = await consumeUserRateLimit({
			userId: auth.userId,
			rule: GENERATE_PLAN_RATE_LIMIT,
			nowEpochSeconds: Math.floor(systemClock.now().getTime() / 1000),
		});
		if (!rateLimit.allowed) {
			return rateLimitedJson(rateLimit.retryAfterSeconds);
		}

		// ---- Adapter 入力マッピング (validate-then-compute 境界) ----
		const payloadResult = buildPayload(auth.userId, week_start, profile);
		if (!payloadResult.ok) {
			console.error("toSafe* mapping failed", {
				name:
					payloadResult.error instanceof Error
						? payloadResult.error.name
						: typeof payloadResult.error,
			});
			return badGatewayJson({ error: "profile_mapping_failed" });
		}

		// ---- AgentCore Runtime invoke ----
		const invokeResult = await safeInvokeAgent(payloadResult.payload);
		if (!invokeResult.ok) return invokeResult.errorResponse;

		// ---- 応答検証 ----
		const wrap = z
			.object({ generated_weekly_plan: z.unknown() })
			.safeParse(invokeResult.response);
		if (!wrap.success) return badGatewayJson({ error: "invalid_plan_shape" });

		const genParse = GeneratedWeeklyPlanSchema.strict().safeParse(
			wrap.data.generated_weekly_plan,
		);
		if (!genParse.success) {
			console.error("invalid generated plan", {
				issues: genParse.error.issues,
			});
			return badGatewayJson({ error: "invalid_plan_shape" });
		}

		// WeeklyPlan assembly: impure read (randomUUID / new Date) をここ 1 箇所に集約。
		const weeklyPlan = assembleWeeklyPlan(genParse.data, {
			plan_id: randomUUID(),
			week_start,
			generated_at: systemClock.now().toISOString(),
		});

		try {
			await docClient.send(
				new PutCommand({
					TableName: TABLE_NAME,
					Item: {
						...planKey(auth.userId, weekStartBranded),
						...weeklyPlan,
						updated_at: weeklyPlan.generated_at,
					},
					...(force_regenerate
						? {}
						: { ConditionExpression: "attribute_not_exists(pk)" }),
				}),
			);
		} catch (err) {
			if (isConditionalCheckFailed(err)) {
				return recoverFromConditionalRace(auth.userId, weekStartBranded);
			}
			console.error("ddb put failed", err);
			return badGatewayJson({ error: "persistence_failed" });
		}

		return ok({
			plan_id: weeklyPlan.plan_id,
			week_start: weeklyPlan.week_start,
			generated_at: weeklyPlan.generated_at,
			weekly_plan: weeklyPlan,
		});
	});
}

async function recoverFromConditionalRace(
	userId: UserId,
	weekStart: IsoDateString,
): Promise<APIGatewayProxyStructuredResultV2> {
	const existing = await readExistingPlan(userId, weekStart);
	if (existing !== null) return ok(existing);
	return badGatewayJson({ error: "race_recovery_failed" });
}

async function readExistingPlan(
	userId: UserId,
	weekStart: IsoDateString,
): Promise<{
	plan_id: string;
	week_start: string;
	generated_at: string;
	weekly_plan: unknown;
} | null> {
	const resp = await docClient.send(
		new GetCommand({
			TableName: TABLE_NAME,
			Key: planKey(userId, weekStart),
			ConsistentRead: true,
		}),
	);
	if (!resp.Item) return null;
	const parse = WeeklyPlanRowSchema.safeParse(stripKeys(resp.Item));
	if (!parse.success) return null;
	const p = parse.data;
	return {
		plan_id: p.plan_id,
		week_start: p.week_start,
		generated_at: p.generated_at,
		weekly_plan: p,
	};
}

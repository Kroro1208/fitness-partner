import {
	DeleteCommand,
	DynamoDBDocumentClient,
	GetCommand,
	PutCommand,
	UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
	buildMeal,
	buildPersistedPlanRow,
	completeProfileItem,
	makeApplyEvent,
	makeCandidatesEvent,
	TEST_USER_ID,
	TEST_WEEK_START,
} from "./fixtures";

// env setup must happen before dynamo / handler import
process.env.TABLE_NAME = "FitnessTable";
process.env.AGENTCORE_REGION = "us-west-2";
process.env.AGENTCORE_RUNTIME_ARN =
	"arn:aws:bedrock-agentcore:us-west-2:0:runtime/x";

const ddbMock = mockClient(DynamoDBDocumentClient);

// 境界モック: agentcore-client の内部関数ではなく AWS SDK の BedrockAgentCoreClient
// を vi.mock で置換し、agentcore-client.ts の payload 構築 / stream parse / abort 処理を
// 本物のまま実行する。aws-sdk-client-mock (DDB) と同じ「外部 SDK 境界で止める」原則。
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));
vi.mock("@aws-sdk/client-bedrock-agentcore", () => ({
	BedrockAgentCoreClient: vi
		.fn()
		.mockImplementation(() => ({ send: sendMock })),
	InvokeAgentRuntimeCommand: vi.fn().mockImplementation((input) => input),
}));

/** AgentCore の InvokeAgentRuntimeCommand 戻り値 (response: AsyncIterable<Uint8Array>) を組み立てる。 */
function mockSwapResponse(payload: unknown): void {
	sendMock.mockResolvedValueOnce({
		response: (async function* () {
			yield new TextEncoder().encode(JSON.stringify(payload));
		})(),
	});
}

/** AbortError 等で send が reject する分岐。 */
function mockSwapSendError(error: Error): void {
	sendMock.mockRejectedValueOnce(error);
}

async function importHandler() {
	return (await import("../../../lambdas/swap-meal/index")).handler;
}

beforeEach(() => {
	ddbMock.reset();
	sendMock.mockReset();
});

// -----------------------------------------------------------------------
// candidates
// -----------------------------------------------------------------------

describe("swap-meal handler candidates", () => {
	it("404 meal_not_found: target slot が target 日に存在しない", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow() });
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "dessert" }),
		);
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "meal_not_found" });
	});

	it("404 meal_not_found: 存在しない date", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow() });
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2099-01-01", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "meal_not_found" });
	});

	it("429 rate_limited: 上限超過時は AgentCore を呼ばない", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow() });
		ddbMock.on(UpdateCommand).rejectsOnce(
			Object.assign(new Error("rate exceeded"), {
				name: "ConditionalCheckFailedException",
			}),
		);

		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);

		expect(res.statusCode).toBe(429);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "rate_limited" });
		expect(res.headers?.["Retry-After"]).toBeDefined();
		expect(sendMock).not.toHaveBeenCalled();
	});

	it("404 plan_not_found", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: undefined });
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "plan_not_found" });
	});

	it("400 incomplete_profile_fields: profile の必須欠落", async () => {
		ddbMock.on(GetCommand).resolvesOnce({
			Item: { pk: "u", sk: "profile", onboarding_stage: "in_progress" },
		});
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(400);
	});

	it("502 invalid_swap_shape: Strands の candidates が 2 件", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow() });
		mockSwapResponse({
			generated_candidates: {
				candidates: [buildMeal("breakfast", "a"), buildMeal("breakfast", "b")],
			},
		});
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.body ?? "{}")).toEqual({
			error: "invalid_swap_shape",
		});
	});

	it("502 invalid_swap_shape: Strands envelope 自体が壊れている", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow() });
		mockSwapResponse({
			unexpected_key: {
				candidates: [
					buildMeal("breakfast", "a"),
					buildMeal("breakfast", "b"),
					buildMeal("breakfast", "c"),
				],
			},
		});
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.body ?? "{}")).toEqual({
			error: "invalid_swap_shape",
		});
	});

	it("502 invalid_swap_shape: slot mismatch", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow() });
		mockSwapResponse({
			generated_candidates: {
				candidates: [
					buildMeal("breakfast", "a"),
					buildMeal("lunch", "wrong"),
					buildMeal("breakfast", "c"),
				],
			},
		});
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.body ?? "{}")).toEqual({
			error: "invalid_swap_shape",
		});
	});

	it("504 swap_timeout: AbortError", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow() });
		const err = new Error("aborted");
		err.name = "AbortError";
		mockSwapSendError(err);
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(504);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "swap_timeout" });
	});

	it("200: 3 件成功 + proposal 永続化", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: completeProfileItem })
			.resolvesOnce({ Item: buildPersistedPlanRow(5) });
		ddbMock.on(PutCommand).resolvesOnce({});
		mockSwapResponse({
			generated_candidates: {
				candidates: [
					buildMeal("breakfast", "a"),
					buildMeal("breakfast", "b"),
					buildMeal("breakfast", "c"),
				],
			},
		});
		const handler = await importHandler();
		const res = await handler(
			makeCandidatesEvent({ date: "2026-04-20", slot: "breakfast" }),
		);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body ?? "{}");
		expect(body.proposal_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(body.candidates).toHaveLength(3);

		// proposal の Item に expected_revision / current_plan_id / ttl が含まれる
		const putCalls = ddbMock.commandCalls(PutCommand);
		expect(putCalls).toHaveLength(1);
		const putItem = putCalls[0].args[0].input.Item as Record<string, unknown>;
		expect(putItem.pk).toBe(`user#${TEST_USER_ID}`);
		expect(String(putItem.sk)).toMatch(/^swap_proposal#/);
		expect(putItem.current_plan_id).toBe("pid-test-1");
		expect(putItem.expected_revision).toBe(5);
		expect(typeof putItem.ttl).toBe("number");
	});
});

// -----------------------------------------------------------------------
// apply
// -----------------------------------------------------------------------

function propItem(
	overrides: Partial<{
		ttl: number;
		candidates: unknown[];
		current_plan_id: string;
		expected_revision: number;
		date: string;
		slot: "breakfast" | "lunch" | "dinner" | "dessert";
	}> = {},
) {
	const nowSec = Math.floor(Date.now() / 1000);
	return {
		pk: `user#${TEST_USER_ID}`,
		sk: "swap_proposal#p1",
		ttl: nowSec + 500,
		created_at: "2026-04-25T00:00:00Z",
		candidates: [
			buildMeal("breakfast", "chosen"),
			buildMeal("breakfast", "b"),
			buildMeal("breakfast", "c"),
		],
		current_plan_id: "pid-test-1",
		expected_revision: 0,
		date: "2026-04-20",
		slot: "breakfast" as const,
		week_start: TEST_WEEK_START,
		...overrides,
	};
}

describe("swap-meal handler apply", () => {
	it("404 proposal_expired_or_missing: proposal 不在", async () => {
		ddbMock.on(GetCommand).resolvesOnce({ Item: undefined });
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(404);
		expect(JSON.parse(res.body ?? "{}")).toEqual({
			error: "proposal_expired_or_missing",
		});
	});

	it("410 proposal_expired: ttl 超過", async () => {
		const nowSec = Math.floor(Date.now() / 1000);
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ ttl: nowSec - 10 }) });
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(410);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "proposal_expired" });
	});

	it("400 invalid_chosen_index: candidates 長を超える", async () => {
		// Schema で 0..2 は弾かれるが、proposal.candidates を空にして境界を確認
		ddbMock.on(GetCommand).resolvesOnce({ Item: propItem({ candidates: [] }) });
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.body ?? "{}")).toEqual({
			error: "invalid_chosen_index",
		});
	});

	it("502 invalid_swap_shape: proposal row が壊れている", async () => {
		ddbMock.on(GetCommand).resolvesOnce({
			Item: {
				pk: `user#${TEST_USER_ID}`,
				sk: "swap_proposal#p1",
				ttl: Math.floor(Date.now() / 1000) + 500,
				date: "2026-04-20",
				slot: "breakfast",
				current_plan_id: "pid-test-1",
				expected_revision: 0,
				candidates: "not-an-array",
				created_at: "2026-04-25T00:00:00Z",
				week_start: TEST_WEEK_START,
			},
		});
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.body ?? "{}")).toEqual({
			error: "invalid_swap_shape",
		});
	});

	it("409 plan_stale: plan_id 不一致", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem() })
			.resolvesOnce({
				Item: buildPersistedPlanRow(0, { plan_id: "other-pid" }),
			});
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(409);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "plan_stale" });
	});

	it("409 plan_stale: revision 不一致", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ expected_revision: 0 }) })
			.resolvesOnce({ Item: buildPersistedPlanRow(7) });
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(409);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "plan_stale" });
	});

	// 1 happy path 振る舞いを 4 観点 (revision +1 / ConditionExpression / DeleteItem / day 反映) で検証する。
	// 各観点は同一の Arrange/Act から派生する論理的に不可分な振る舞いの側面のため、
	// 1 it に集約する (分割すると Arrange の重複が大きく診断性も上がらない)。
	it("200 Happy: revision +1 / ConditionExpression / DeleteItem 呼ばれる", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ expected_revision: 2 }) })
			.resolvesOnce({ Item: buildPersistedPlanRow(2) });
		ddbMock.on(PutCommand).resolvesOnce({});
		ddbMock.on(DeleteCommand).resolvesOnce({});
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body ?? "{}");
		expect(body.plan_id).toBe("pid-test-1");
		expect(body.revision).toBe(3);
		expect(body.updated_day.meals[0].title).toBe("chosen");

		const put = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(put.ConditionExpression).toMatch(/plan_id\s*=/);
		expect(put.ConditionExpression).toMatch(/revision\s*=/);
		expect((put.Item as Record<string, unknown>).revision as number).toBe(3);
		expect((put.Item as Record<string, unknown>).plan_id as string).toBe(
			"pid-test-1",
		);
		expect(ddbMock.commandCalls(DeleteCommand)).toHaveLength(1);
	});

	it("200 legacy plan: revision 欠落 item は revision 0 として apply できる", async () => {
		const { revision: _revision, ...legacyPlanRow } = buildPersistedPlanRow(0);
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ expected_revision: 0 }) })
			.resolvesOnce({ Item: legacyPlanRow });
		ddbMock.on(PutCommand).resolvesOnce({});
		ddbMock.on(DeleteCommand).resolvesOnce({});
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);

		expect(res.statusCode).toBe(200);
		const put = ddbMock.commandCalls(PutCommand)[0].args[0].input;
		expect(put.ConditionExpression).toContain("attribute_not_exists(revision)");
		expect((put.Item as Record<string, unknown>).revision).toBe(1);
	});

	it("409 on ConditionalCheckFailedException", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ expected_revision: 2 }) })
			.resolvesOnce({ Item: buildPersistedPlanRow(2) });
		const err = new Error("ccf");
		err.name = "ConditionalCheckFailedException";
		ddbMock.on(PutCommand).rejectsOnce(err);
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(409);
		expect(JSON.parse(res.body ?? "{}")).toEqual({ error: "plan_stale" });
	});

	it("200 even when DeleteItem fails (non-fatal, revision monotonicity 担保)", async () => {
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ expected_revision: 2 }) })
			.resolvesOnce({ Item: buildPersistedPlanRow(2) });
		ddbMock.on(PutCommand).resolvesOnce({});
		ddbMock.on(DeleteCommand).rejectsOnce(new Error("delete failed"));
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res.statusCode).toBe(200);
	});

	it("security: body に chosen_meal を混入しても server は proposal.candidates を使う", async () => {
		const serverMeal = buildMeal("breakfast", "SERVER_GENERATED");
		ddbMock
			.on(GetCommand)
			.resolvesOnce({
				Item: propItem({
					candidates: [
						serverMeal,
						buildMeal("breakfast", "b"),
						buildMeal("breakfast", "c"),
					],
				}),
			})
			.resolvesOnce({ Item: buildPersistedPlanRow(0) });
		ddbMock.on(PutCommand).resolvesOnce({});
		ddbMock.on(DeleteCommand).resolvesOnce({});
		const handler = await importHandler();
		const res = await handler(
			makeApplyEvent({
				proposal_id: "p1",
				chosen_index: 0,
				// 攻撃者注入
				chosen_meal: buildMeal("breakfast", "ATTACKER_INJECTED"),
				date: "2026-04-20",
				slot: "breakfast",
			}),
		);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body ?? "{}");
		expect(body.updated_day.meals[0].title).toBe("SERVER_GENERATED");
		expect(body.updated_day.meals[0].title).not.toBe("ATTACKER_INJECTED");
	});
});

// -----------------------------------------------------------------------
// concurrency
// -----------------------------------------------------------------------

describe("swap-meal handler concurrency", () => {
	it("2 つの同 revision proposal: 1 回目 apply 成功、2 回目は 409", async () => {
		const handler = await importHandler();

		// 1 回目: revision=0 の plan、proposal の expected_revision=0 → 成功、revision 1 へ
		ddbMock
			.on(GetCommand)
			.resolvesOnce({
				Item: { ...propItem({ expected_revision: 0 }), sk: "swap_proposal#p1" },
			})
			.resolvesOnce({ Item: buildPersistedPlanRow(0) });
		ddbMock.on(PutCommand).resolvesOnce({});
		ddbMock.on(DeleteCommand).resolvesOnce({});
		const res1 = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res1.statusCode).toBe(200);

		// 2 回目: 別 proposal (expected_revision=0 で作られた) だが plan.revision=1
		ddbMock.reset();
		ddbMock
			.on(GetCommand)
			.resolvesOnce({
				Item: { ...propItem({ expected_revision: 0 }), sk: "swap_proposal#p2" },
			})
			.resolvesOnce({ Item: buildPersistedPlanRow(1) });
		const res2 = await handler(
			makeApplyEvent({ proposal_id: "p2", chosen_index: 0 }),
		);
		expect(res2.statusCode).toBe(409);
		expect(JSON.parse(res2.body ?? "{}")).toEqual({ error: "plan_stale" });
		// apply 経路は AgentCore (LLM) を呼ばない契約を明示
		expect(sendMock).not.toHaveBeenCalled();
	});

	it("DeleteItem 失敗後でも再 apply は 409 (revision monotonicity)", async () => {
		const handler = await importHandler();

		// 1 回目: 成功、DeleteItem だけ失敗
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ expected_revision: 0 }) })
			.resolvesOnce({ Item: buildPersistedPlanRow(0) });
		ddbMock.on(PutCommand).resolvesOnce({});
		ddbMock.on(DeleteCommand).rejectsOnce(new Error("delete failed"));
		const res1 = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res1.statusCode).toBe(200);

		// 2 回目: proposal が残存 (delete 失敗) + plan.revision は既に 1
		ddbMock.reset();
		ddbMock
			.on(GetCommand)
			.resolvesOnce({ Item: propItem({ expected_revision: 0 }) })
			.resolvesOnce({ Item: buildPersistedPlanRow(1) });
		const res2 = await handler(
			makeApplyEvent({ proposal_id: "p1", chosen_index: 0 }),
		);
		expect(res2.statusCode).toBe(409);
		expect(JSON.parse(res2.body ?? "{}")).toEqual({ error: "plan_stale" });
		// apply 経路は AgentCore (LLM) を呼ばない契約を明示
		expect(sendMock).not.toHaveBeenCalled();
	});
});

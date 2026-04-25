import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSend, mockInvoke } = vi.hoisted(() => ({
	mockSend: vi.fn(),
	mockInvoke: vi.fn(),
}));
vi.mock("@aws-sdk/lib-dynamodb", async () => {
	const actual = await vi.importActual<typeof import("@aws-sdk/lib-dynamodb")>(
		"@aws-sdk/lib-dynamodb",
	);
	return {
		...actual,
		DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
	};
});
vi.mock("../../../lambdas/generate-plan/agentcore-client", () => ({
	invokeAgent: mockInvoke,
}));

process.env.TABLE_NAME = "FitnessTable";
process.env.AGENTCORE_RUNTIME_ARN =
	"arn:aws:bedrock-agentcore:us-west-2:0:runtime/x";

import { handler } from "../../../lambdas/generate-plan/index";
import {
	completeProfileItem,
	makeAuthEvent,
	makeGeneratedPlan,
} from "./fixtures";

beforeEach(() => {
	mockSend.mockReset();
	mockInvoke.mockReset();
});

describe("generate-plan handler", () => {
	it("onboarding 未完了で 400", async () => {
		mockSend.mockResolvedValueOnce({
			Item: { ...completeProfileItem, onboarding_stage: "stats" },
		});
		const res = await handler(
			makeAuthEvent({
				body: JSON.stringify({ week_start: "2026-04-20" }),
			}),
		);
		expect(res.statusCode).toBe(400);
		expect(JSON.parse(res.body ?? "{}").error).toBe("onboarding_incomplete");
	});

	it("既存 plan あり force=false → 既存返却", async () => {
		const existing = {
			...makeGeneratedPlan(),
			plan_id: "old-id",
			week_start: "2026-04-20",
			generated_at: "2026-04-19T00:00:00Z",
			revision: 0,
		};
		mockSend
			.mockResolvedValueOnce({ Item: completeProfileItem })
			.mockResolvedValueOnce({
				Item: { ...existing, pk: "user#u1", sk: "plan#2026-04-20" },
			});
		const res = await handler(
			makeAuthEvent({
				body: JSON.stringify({ week_start: "2026-04-20" }),
			}),
		);
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body ?? "{}").plan_id).toBe("old-id");
		expect(mockInvoke).not.toHaveBeenCalled();
	});

	it("正常系: AgentCore → Put → 200", async () => {
		mockSend
			.mockResolvedValueOnce({ Item: completeProfileItem })
			.mockResolvedValueOnce({})
			.mockResolvedValueOnce({});
		mockInvoke.mockResolvedValueOnce({
			generated_weekly_plan: makeGeneratedPlan(),
		});
		const res = await handler(
			makeAuthEvent({
				body: JSON.stringify({ week_start: "2026-04-20" }),
			}),
		);
		expect(res.statusCode).toBe(200);
		const body = JSON.parse(res.body ?? "{}");
		expect(body.weekly_plan.days).toHaveLength(7);
		expect(body.plan_id).toMatch(/^[0-9a-f-]{36}$/);
		// Plan 09: 新規 plan は revision=0 で始まる
		expect(body.weekly_plan.revision).toBe(0);
	});

	it("GeneratedWeeklyPlan schema 違反で 502", async () => {
		mockSend
			.mockResolvedValueOnce({ Item: completeProfileItem })
			.mockResolvedValueOnce({});
		mockInvoke.mockResolvedValueOnce({ generated_weekly_plan: { days: [] } });
		const res = await handler(
			makeAuthEvent({
				body: JSON.stringify({ week_start: "2026-04-20" }),
			}),
		);
		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.body ?? "{}").error).toBe("invalid_plan_shape");
	});

	it("ConditionalCheckFailed → 既存再読して 200", async () => {
		const existing = {
			...makeGeneratedPlan(),
			plan_id: "raced-id",
			week_start: "2026-04-20",
			generated_at: "2026-04-19T00:00:00Z",
			revision: 0,
		};
		mockSend
			.mockResolvedValueOnce({ Item: completeProfileItem })
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(
				Object.assign(new Error("ccf"), {
					name: "ConditionalCheckFailedException",
				}),
			)
			.mockResolvedValueOnce({
				Item: { ...existing, pk: "user#u1", sk: "plan#2026-04-20" },
			});
		mockInvoke.mockResolvedValueOnce({
			generated_weekly_plan: makeGeneratedPlan(),
		});
		const res = await handler(
			makeAuthEvent({
				body: JSON.stringify({ week_start: "2026-04-20" }),
			}),
		);
		expect(res.statusCode).toBe(200);
		expect(JSON.parse(res.body ?? "{}").plan_id).toBe("raced-id");
	});

	it("Put 非 conditional 失敗で 502 persistence_failed", async () => {
		mockSend
			.mockResolvedValueOnce({ Item: completeProfileItem })
			.mockResolvedValueOnce({})
			.mockRejectedValueOnce(new Error("DDB throttled"));
		mockInvoke.mockResolvedValueOnce({
			generated_weekly_plan: makeGeneratedPlan(),
		});
		const res = await handler(
			makeAuthEvent({
				body: JSON.stringify({ week_start: "2026-04-20" }),
			}),
		);
		expect(res.statusCode).toBe(502);
		expect(JSON.parse(res.body ?? "{}").error).toBe("persistence_failed");
	});

	it("AgentCore timeout で 504", async () => {
		mockSend
			.mockResolvedValueOnce({ Item: completeProfileItem })
			.mockResolvedValueOnce({});
		mockInvoke.mockRejectedValueOnce(
			Object.assign(new Error("aborted"), { name: "AbortError" }),
		);
		const res = await handler(
			makeAuthEvent({
				body: JSON.stringify({ week_start: "2026-04-20" }),
			}),
		);
		expect(res.statusCode).toBe(504);
		expect(JSON.parse(res.body ?? "{}").error).toBe("generation_timeout");
	});
});

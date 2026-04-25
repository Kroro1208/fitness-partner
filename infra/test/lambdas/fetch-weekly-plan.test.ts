// TABLE_NAME は vitest.config.ts の env で設定済み

import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { handler } from "../../lambdas/fetch-weekly-plan/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
	ddbMock.reset();
});

/**
 * 生成済み WeeklyPlanSchema を満たす最小 fixture を組み立てる helper。
 * strict parse を通すため全 required フィールドを埋める。
 */
function buildValidPlanItem(overrides: Record<string, unknown> = {}) {
	const meal = {
		slot: "breakfast" as const,
		title: "卵とご飯",
		items: [
			{
				food_id: null,
				name: "卵",
				grams: 100,
				calories_kcal: 150,
				protein_g: 12,
				fat_g: 10,
				carbs_g: 1,
			},
		],
		total_calories_kcal: 150,
		total_protein_g: 12,
		total_fat_g: 10,
		total_carbs_g: 1,
		prep_tag: null,
		notes: null,
	};
	const day = (date: string) => ({
		date,
		theme: "高タンパク",
		meals: [meal, meal, meal],
		daily_total_calories_kcal: 450,
		daily_total_protein_g: 36,
		daily_total_fat_g: 30,
		daily_total_carbs_g: 3,
	});
	return {
		pk: "user#user-123",
		sk: "plan#2026-04-13",
		plan_id: "p1",
		week_start: "2026-04-13",
		generated_at: "2026-04-13T00:00:00Z",
		revision: 0,
		target_calories_kcal: 2000,
		target_protein_g: 150,
		target_fat_g: 70,
		target_carbs_g: 200,
		days: [
			day("2026-04-13"),
			day("2026-04-14"),
			day("2026-04-15"),
			day("2026-04-16"),
			day("2026-04-17"),
			day("2026-04-18"),
			day("2026-04-19"),
		],
		hydration_target_liters: 2.5,
		personal_rules: ["rule1", "rule2", "rule3"],
		...overrides,
	};
}

describe("fetchWeeklyPlan", () => {
	it("returns plan when found", async () => {
		ddbMock.on(GetCommand).resolves({
			Item: buildValidPlanItem(),
		});

		const event = makeEvent({
			method: "GET",
			path: "/users/me/plans/2026-04-13",
			pathParameters: { weekStart: "2026-04-13" },
			sub: "user-123",
		});
		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		const body = JSON.parse(String(result.body));
		expect(body.plan.plan_id).toBe("p1");
		expect(body.plan.days).toHaveLength(7);
		expect(body.plan.pk).toBeUndefined();
		expect(body.plan.sk).toBeUndefined();
	});

	it("returns legacy plan with missing revision as revision 0", async () => {
		const { revision: _revision, ...legacyItem } = buildValidPlanItem();
		ddbMock.on(GetCommand).resolves({ Item: legacyItem });

		const result = await handler(
			makeEvent({
				method: "GET",
				path: "/users/me/plans/2026-04-13",
				pathParameters: { weekStart: "2026-04-13" },
				sub: "user-123",
			}),
		);

		expect(result.statusCode).toBe(200);
		const body = JSON.parse(String(result.body));
		expect(body.plan.revision).toBe(0);
	});

	it("ConsistentRead: true を GetCommand に渡す", async () => {
		ddbMock.on(GetCommand).resolves({ Item: buildValidPlanItem() });

		const event = makeEvent({
			method: "GET",
			path: "/users/me/plans/2026-04-13",
			pathParameters: { weekStart: "2026-04-13" },
			sub: "user-123",
		});
		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		const calls = ddbMock.commandCalls(GetCommand);
		expect(calls).toHaveLength(1);
		expect(calls[0].args[0].input.ConsistentRead).toBe(true);
	});

	it("returns 404 when plan not found", async () => {
		ddbMock.on(GetCommand).resolves({ Item: undefined });

		const event = makeEvent({
			method: "GET",
			path: "/users/me/plans/2026-04-13",
			pathParameters: { weekStart: "2026-04-13" },
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(404);
	});

	it("returns 400 when weekStart path parameter is missing", async () => {
		const event = makeEvent({
			method: "GET",
			path: "/users/me/plans/",
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 when weekStart format is invalid", async () => {
		const event = makeEvent({
			method: "GET",
			path: "/users/me/plans/20260413",
			pathParameters: { weekStart: "20260413" },
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 401 when sub is missing", async () => {
		const result = await handler(
			makeEvent({
				method: "GET",
				path: "/users/me/plans/2026-04-13",
				pathParameters: { weekStart: "2026-04-13" },
				noAuth: true,
			}),
		);
		expect(result.statusCode).toBe(401);
	});

	it("returns 500 when DynamoDB throws", async () => {
		ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));
		const event = makeEvent({
			method: "GET",
			path: "/users/me/plans/2026-04-13",
			pathParameters: { weekStart: "2026-04-13" },
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(500);
	});
});

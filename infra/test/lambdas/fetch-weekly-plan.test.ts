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

describe("fetchWeeklyPlan", () => {
	it("returns plan when found", async () => {
		ddbMock.on(GetCommand).resolves({
			Item: {
				pk: "user#user-123",
				sk: "plan#2026-04-13",
				meals: [{ day: "mon", recipe: "chicken_salad" }],
			},
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
		expect(body.plan.meals).toEqual([{ day: "mon", recipe: "chicken_salad" }]);
		expect(body.plan.pk).toBeUndefined();
		expect(body.plan.sk).toBeUndefined();
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

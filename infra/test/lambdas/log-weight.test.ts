// TABLE_NAME は vitest.config.ts の env で設定済み

import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { handler } from "../../lambdas/log-weight/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
	ddbMock.reset();
});

describe("logWeight", () => {
	const validBody = { date: "2026-04-13", weight_kg: 70.5 };

	it("creates weight log and returns weight object", async () => {
		ddbMock.on(PutCommand).resolves({});

		const event = makeEvent({
			method: "POST",
			path: "/users/me/weight",
			body: JSON.stringify(validBody),
			sub: "user-123",
		});
		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		const body = JSON.parse(String(result.body));
		expect(body.weight.date).toBe("2026-04-13");
		expect(body.weight.weight_kg).toBe(70.5);
		expect(body.weight.logged_at).toBeDefined();
		expect(body.weight.pk).toBeUndefined();
		expect(body.weight.sk).toBeUndefined();
	});

	it("returns 400 for missing body", async () => {
		const event = makeEvent({ method: "POST", path: "/users/me/weight" });
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 for invalid date format", async () => {
		const event = makeEvent({
			method: "POST",
			path: "/users/me/weight",
			body: JSON.stringify({ date: "20260413", weight_kg: 70 }),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 for weight_kg <= 0", async () => {
		const event = makeEvent({
			method: "POST",
			path: "/users/me/weight",
			body: JSON.stringify({ date: "2026-04-13", weight_kg: 0 }),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 for weight_kg >= 500", async () => {
		const event = makeEvent({
			method: "POST",
			path: "/users/me/weight",
			body: JSON.stringify({ date: "2026-04-13", weight_kg: 500 }),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 401 when sub is missing", async () => {
		const result = await handler(
			makeEvent({
				method: "POST",
				path: "/users/me/weight",
				body: JSON.stringify(validBody),
				noAuth: true,
			}),
		);
		expect(result.statusCode).toBe(401);
	});

	it("returns 500 when DynamoDB throws", async () => {
		ddbMock.on(PutCommand).rejects(new Error("DynamoDB unavailable"));
		const event = makeEvent({
			method: "POST",
			path: "/users/me/weight",
			body: JSON.stringify(validBody),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(500);
	});
});

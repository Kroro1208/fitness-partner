// TABLE_NAME は vitest.config.ts の env で設定済み

import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
	buildProfileUpdateExpression,
	buildUpdateExpression,
} from "../../lambdas/shared/dynamo-expression";
import { handler } from "../../lambdas/update-user-profile/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
	ddbMock.reset();
});

// ── buildUpdateExpression ───────────────────────────────────────────

describe("buildUpdateExpression", () => {
	it("builds SET expression for single field", () => {
		const expr = buildUpdateExpression({ name: "太郎" });
		expect(expr.UpdateExpression).toBe("SET #name = :name");
		expect(expr.ExpressionAttributeNames).toEqual({ "#name": "name" });
		expect(expr.ExpressionAttributeValues).toEqual({ ":name": "太郎" });
		expect(expr.removeFields).toEqual([]);
	});

	it("builds SET expression for multiple fields", () => {
		const expr = buildUpdateExpression({ name: "太郎", age: 30 });
		expect(expr.UpdateExpression).toContain("#name = :name");
		expect(expr.UpdateExpression).toContain("#age = :age");
		expect(expr.ExpressionAttributeNames).toEqual({
			"#name": "name",
			"#age": "age",
		});
		expect(expr.ExpressionAttributeValues).toEqual({
			":name": "太郎",
			":age": 30,
		});
		expect(expr.removeFields).toEqual([]);
	});

	it("assumes caller already filtered null/undefined values", () => {
		const expr = buildUpdateExpression({
			name: "太郎",
			updated_at: "2026-04-13T00:00:00Z",
		});
		expect(expr.UpdateExpression).toContain("#name = :name");
		expect(expr.UpdateExpression).toContain("#updated_at = :updated_at");
		expect(expr.removeFields).toEqual([]);
	});

	it("builds SET + REMOVE expression for profile clear", () => {
		const expr = buildProfileUpdateExpression({
			setFields: {
				name: "太郎",
				updated_at: "2026-04-13T00:00:00Z",
			},
			removeFields: ["weight_kg", "sleep_hours"],
		});

		expect(expr.UpdateExpression).toBe(
			"SET #name = :name, #updated_at = :updated_at REMOVE #weight_kg, #sleep_hours",
		);
		expect(expr.ExpressionAttributeNames).toEqual({
			"#name": "name",
			"#updated_at": "updated_at",
			"#weight_kg": "weight_kg",
			"#sleep_hours": "sleep_hours",
		});
		expect(expr.ExpressionAttributeValues).toEqual({
			":name": "太郎",
			":updated_at": "2026-04-13T00:00:00Z",
		});
	});
});

// ── handler ─────────────────────────────────────────────────────────

describe("updateUserProfile handler", () => {
	it("updates profile and returns ALL_NEW without pk/sk", async () => {
		ddbMock.on(UpdateCommand).resolves({
			Attributes: {
				pk: "user#user-123",
				sk: "profile",
				name: "太郎",
				age: 30,
			},
		});

		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({ name: "太郎" }),
			sub: "user-123",
		});
		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		const body = JSON.parse(String(result.body));
		expect(body.profile).toEqual({ name: "太郎", age: 30 });
		expect(body.profile.pk).toBeUndefined();
	});

	it("returns 400 for empty body", async () => {
		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({}),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 for missing body", async () => {
		const event = makeEvent({ method: "PATCH", path: "/users/me/profile" });
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 for invalid field value", async () => {
		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({ age: 17 }),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 for age above max", async () => {
		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({ age: 121 }),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("returns 400 for invalid sex enum", async () => {
		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({ sex: "other" }),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(400);
	});

	it("removes null fields from persisted profile", async () => {
		ddbMock.on(UpdateCommand).resolves({
			Attributes: { pk: "user#u1", sk: "profile", name: "花子" },
		});

		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({ name: "花子", age: null }),
			sub: "u1",
		});
		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		const body = JSON.parse(String(result.body));
		expect(body.profile).toEqual({ name: "花子" });

		const command = ddbMock.commandCalls(UpdateCommand)[0];
		expect(command.args[0].input.UpdateExpression).toContain("REMOVE #age");
		expect(command.args[0].input.ExpressionAttributeNames).toMatchObject({
			"#age": "age",
		});
	});

	it("returns 400 when all provided fields are null", async () => {
		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({ name: null, age: null }),
		});
		const result = await handler(event);

		expect(result.statusCode).toBe(400);
	});

	it("returns 401 when sub is missing", async () => {
		const result = await handler(
			makeEvent({
				method: "PATCH",
				path: "/users/me/profile",
				body: JSON.stringify({ name: "太郎" }),
				noAuth: true,
			}),
		);
		expect(result.statusCode).toBe(401);
	});

	it("returns 500 when DynamoDB throws", async () => {
		ddbMock.on(UpdateCommand).rejects(new Error("DynamoDB unavailable"));
		const event = makeEvent({
			method: "PATCH",
			path: "/users/me/profile",
			body: JSON.stringify({ name: "太郎" }),
		});
		const result = await handler(event);
		expect(result.statusCode).toBe(500);
	});
});

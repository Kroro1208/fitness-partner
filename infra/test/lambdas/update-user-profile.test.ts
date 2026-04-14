// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PROFILE_FIELDS } from "../../lambdas/shared/types";
import {
  handler,
  validateUpdateProfileInput,
  buildUpdateExpression,
} from "../../lambdas/update-user-profile/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

// ── validateUpdateProfileInput ──────────────────────────────────────

describe("validateUpdateProfileInput", () => {
  it("accepts valid single field", () => {
    const result = validateUpdateProfileInput({ name: "太郎" });
    expect(result.valid).toBe(true);
  });

  it("accepts valid multiple fields", () => {
    const result = validateUpdateProfileInput({
      name: "太郎",
      age: 30,
      sex: "male",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects non-object body", () => {
    const result = validateUpdateProfileInput("string");
    expect(result.valid).toBe(false);
  });

  it("rejects null body", () => {
    const result = validateUpdateProfileInput(null);
    expect(result.valid).toBe(false);
  });

  it("rejects empty object", () => {
    const result = validateUpdateProfileInput({});
    expect(result.valid).toBe(false);
  });

  it("rejects all-null fields", () => {
    const result = validateUpdateProfileInput({
      name: null,
      age: null,
    });
    expect(result.valid).toBe(false);
  });

  // ── schema ↔ TS ガード一致の自動検証 ───────────────────────────
  it("PROFILE_FIELDS matches JSON Schema properties", async () => {
    const schema =
      await import("../../../packages/contracts-ts/schemas/UpdateUserProfileInput.schema.json");
    const schemaFields = new Set(Object.keys(schema.properties ?? {}));
    const tsFields = new Set(PROFILE_FIELDS);
    expect(tsFields).toEqual(schemaFields);
  });

  // 境界値テスト群
  it("rejects age below minimum (17 < 18)", () => {
    const result = validateUpdateProfileInput({ age: 17 });
    expect(result.valid).toBe(false);
  });

  it("accepts age at minimum (18)", () => {
    const result = validateUpdateProfileInput({ age: 18 });
    expect(result.valid).toBe(true);
  });

  it("accepts age at maximum (120)", () => {
    const result = validateUpdateProfileInput({ age: 120 });
    expect(result.valid).toBe(true);
  });

  it("rejects age above maximum (121 > 120)", () => {
    const result = validateUpdateProfileInput({ age: 121 });
    expect(result.valid).toBe(false);
  });

  it("rejects height_cm at zero (gt=0)", () => {
    const result = validateUpdateProfileInput({ height_cm: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects height_cm at 300 (lt=300)", () => {
    const result = validateUpdateProfileInput({ height_cm: 300 });
    expect(result.valid).toBe(false);
  });

  it("rejects weight_kg at zero (gt=0)", () => {
    const result = validateUpdateProfileInput({ weight_kg: 0 });
    expect(result.valid).toBe(false);
  });

  it("rejects weight_kg at 500 (lt=500)", () => {
    const result = validateUpdateProfileInput({ weight_kg: 500 });
    expect(result.valid).toBe(false);
  });

  it("rejects sleep_hours below zero (ge=0)", () => {
    const result = validateUpdateProfileInput({ sleep_hours: -1 });
    expect(result.valid).toBe(false);
  });

  it("rejects sleep_hours above 24 (le=24)", () => {
    const result = validateUpdateProfileInput({ sleep_hours: 25 });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid sex value", () => {
    const result = validateUpdateProfileInput({ sex: "other" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid activity_level", () => {
    const result = validateUpdateProfileInput({ activity_level: "invalid" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid desired_pace", () => {
    const result = validateUpdateProfileInput({ desired_pace: "slow" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid stress_level", () => {
    const result = validateUpdateProfileInput({ stress_level: "extreme" });
    expect(result.valid).toBe(false);
  });

  it("ignores unknown fields", () => {
    const result = validateUpdateProfileInput({
      name: "太郎",
      unknown: "value",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data).not.toHaveProperty("unknown");
    }
  });
});

// ── buildUpdateExpression ───────────────────────────────────────────

describe("buildUpdateExpression", () => {
  it("builds SET expression for single field", () => {
    const expr = buildUpdateExpression({ name: "太郎" });
    expect(expr.UpdateExpression).toBe("SET #name = :name");
    expect(expr.ExpressionAttributeNames).toEqual({ "#name": "name" });
    expect(expr.ExpressionAttributeValues).toEqual({ ":name": "太郎" });
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
  });

  it("assumes caller already filtered null/undefined values", () => {
    const expr = buildUpdateExpression({ name: "太郎", updated_at: "2026-04-13T00:00:00Z" });
    expect(expr.UpdateExpression).toContain("#name = :name");
    expect(expr.UpdateExpression).toContain("#updated_at = :updated_at");
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

  it("sends UpdateItem with correct key and expression", async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { pk: "user#u1", sk: "profile", name: "花子" },
    });

    const event = makeEvent({
      method: "PATCH",
      path: "/users/me/profile",
      body: JSON.stringify({ name: "花子" }),
      sub: "u1",
    });
    await handler(event);

    const call = ddbMock.commandCalls(UpdateCommand)[0];
    expect(call.args[0].input.Key).toEqual({ pk: "user#u1", sk: "profile" });
    expect(call.args[0].input.ReturnValues).toBe("ALL_NEW");
  });

  it("excludes null fields from update", async () => {
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

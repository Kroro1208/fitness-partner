// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../lambdas/log-meal/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
  vi.stubGlobal("crypto", {
    randomUUID: () => "00000000-0000-0000-0000-000000000001",
  });
});

describe("logMeal", () => {
  const validBody = {
    date: "2026-04-13",
    food_id: "01001",
    amount_g: 150,
    meal_type: "breakfast",
  };

  it("creates meal log and returns meal object", async () => {
    ddbMock.on(PutCommand).resolves({});

    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify(validBody),
      sub: "user-123",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    expect(body.meal.meal_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.meal.date).toBe("2026-04-13");
    expect(body.meal.food_id).toBe("01001");
    expect(body.meal.amount_g).toBe(150);
    expect(body.meal.meal_type).toBe("breakfast");
    expect(body.meal.logged_at).toBeDefined();
    expect(body.meal.pk).toBeUndefined();
    expect(body.meal.sk).toBeUndefined();
  });

  it("sends PutItem with correct pk/sk", async () => {
    ddbMock.on(PutCommand).resolves({});

    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify(validBody),
      sub: "user-123",
    });
    await handler(event);

    const call = ddbMock.commandCalls(PutCommand)[0];
    const item = call.args[0].input.Item;
    expect(item?.pk).toBe("user#user-123");
    expect(item?.sk).toBe(
      "meal#2026-04-13#00000000-0000-0000-0000-000000000001",
    );
  });

  it("returns 400 for missing body", async () => {
    const event = makeEvent({ method: "POST", path: "/users/me/meals" });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for invalid date format", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, date: "2026/04/13" }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for empty food_id", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, food_id: "" }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for amount_g <= 0", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, amount_g: 0 }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 400 for invalid meal_type", async () => {
    const event = makeEvent({
      method: "POST",
      path: "/users/me/meals",
      body: JSON.stringify({ ...validBody, meal_type: "brunch" }),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
  });

  it("returns 401 when sub is missing", async () => {
    const result = await handler(
      makeEvent({
        method: "POST",
        path: "/users/me/meals",
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
      path: "/users/me/meals",
      body: JSON.stringify(validBody),
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
  });
});

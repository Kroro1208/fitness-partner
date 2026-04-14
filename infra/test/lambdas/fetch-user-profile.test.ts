// TABLE_NAME は vitest.config.ts の env で設定済み

import { beforeEach, describe, expect, it } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../lambdas/fetch-user-profile/index";
import { makeEvent } from "./helpers/api-event";

const ddbMock = mockClient(DynamoDBDocumentClient);

beforeEach(() => {
  ddbMock.reset();
});

describe("fetchUserProfile", () => {
  it("returns profile when found", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        pk: "user#user-123",
        sk: "profile",
        name: "太郎",
        age: 30,
      },
    });

    const event = makeEvent({
      method: "GET",
      path: "/users/me/profile",
      sub: "user-123",
    });
    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(String(result.body));
    expect(body.profile).toEqual({ name: "太郎", age: 30 });
    expect(body.profile.pk).toBeUndefined();
    expect(body.profile.sk).toBeUndefined();
  });

  it("returns 404 when profile not found", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const event = makeEvent({ sub: "user-123" });
    const result = await handler(event);

    expect(result.statusCode).toBe(404);
  });

  it("uses correct DynamoDB key", async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    const event = makeEvent({ sub: "abc-def" });
    await handler(event);

    const call = ddbMock.commandCalls(GetCommand)[0];
    expect(call.args[0].input).toEqual({
      TableName: "test-table",
      Key: { pk: "user#abc-def", sk: "profile" },
    });
  });

  it("returns 401 when sub is missing", async () => {
    const result = await handler(makeEvent({ noAuth: true }));
    expect(result.statusCode).toBe(401);
  });

  it("returns 500 when DynamoDB throws", async () => {
    ddbMock.on(GetCommand).rejects(new Error("DynamoDB unavailable"));
    const result = await handler(makeEvent({ sub: "user-123" }));
    expect(result.statusCode).toBe(500);
  });
});

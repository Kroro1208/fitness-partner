import { describe, expect, it } from "vitest";
import { getUserId, requireUserId } from "../../../lambdas/shared/auth";
import { makeEvent } from "../helpers/api-event";

describe("getUserId", () => {
  it("returns ok with userId when sub exists", () => {
    const result = getUserId(makeEvent({ sub: "abc-123" }));
    expect(result).toEqual({ ok: true, userId: "abc-123" });
  });

  it("returns ok: false when sub claim is missing", () => {
    const result = getUserId(makeEvent({ noAuth: true }));
    expect(result).toEqual({ ok: false });
  });

  it("returns ok: false when sub is empty string", () => {
    const result = getUserId(makeEvent({ sub: "" }));
    expect(result).toEqual({ ok: false });
  });
});

describe("requireUserId", () => {
  it("returns 401 response when sub claim is missing", () => {
    const result = requireUserId(makeEvent({ noAuth: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.statusCode).toBe(401);
    }
  });
});

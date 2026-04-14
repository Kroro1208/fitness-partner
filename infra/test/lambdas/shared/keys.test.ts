import { describe, expect, it } from "vitest";
import {
  mealKey,
  planKey,
  profileKey,
  weightKey,
} from "../../../lambdas/shared/keys";
import {
  toIsoDateString,
  toMealId,
  toUserId,
} from "../../../lambdas/shared/types";

describe("keys", () => {
  it("builds profile key", () => {
    expect(profileKey(toUserId("user-123"))).toEqual({
      pk: "user#user-123",
      sk: "profile",
    });
  });

  it("builds meal key", () => {
    expect(
      mealKey(
        toUserId("user-123"),
        toIsoDateString("2026-04-13"),
        toMealId("00000000-0000-0000-0000-000000000001"),
      ),
    ).toEqual({
      pk: "user#user-123",
      sk: "meal#2026-04-13#00000000-0000-0000-0000-000000000001",
    });
  });

  it("builds weight and plan keys", () => {
    const userId = toUserId("user-123");
    const date = toIsoDateString("2026-04-13");
    expect(weightKey(userId, date)).toEqual({
      pk: "user#user-123",
      sk: "weight#2026-04-13",
    });
    expect(planKey(userId, date)).toEqual({
      pk: "user#user-123",
      sk: "plan#2026-04-13",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
	type IsoDateString,
	type MealId,
	toIsoDateString,
	toMealId,
	toUserId,
	type UserId,
} from "../../../lambdas/shared/brand";
import { mealKey } from "../../../lambdas/shared/keys/meal";
import { planKey } from "../../../lambdas/shared/keys/plan";
import { profileKey } from "../../../lambdas/shared/keys/profile";
import { weightKey } from "../../../lambdas/shared/keys/weight";

function requireUser(value: string): UserId {
	const v = toUserId(value);
	if (!v) throw new Error(`invalid UserId: ${value}`);
	return v;
}
function requireMeal(value: string): MealId {
	const v = toMealId(value);
	if (!v) throw new Error(`invalid MealId: ${value}`);
	return v;
}
function requireDate(value: string): IsoDateString {
	const v = toIsoDateString(value);
	if (!v) throw new Error(`invalid IsoDateString: ${value}`);
	return v;
}

describe("keys", () => {
	it("builds profile key", () => {
		expect(profileKey(requireUser("user-123"))).toEqual({
			pk: "user#user-123",
			sk: "profile",
		});
	});

	it("builds meal key", () => {
		expect(
			mealKey(
				requireUser("user-123"),
				requireDate("2026-04-13"),
				requireMeal("00000000-0000-0000-0000-000000000001"),
			),
		).toEqual({
			pk: "user#user-123",
			sk: "meal#2026-04-13#00000000-0000-0000-0000-000000000001",
		});
	});

	it("builds weight key", () => {
		expect(
			weightKey(requireUser("user-123"), requireDate("2026-04-13")),
		).toEqual({
			pk: "user#user-123",
			sk: "weight#2026-04-13",
		});
	});

	it("builds plan key", () => {
		expect(planKey(requireUser("user-123"), requireDate("2026-04-13"))).toEqual(
			{
				pk: "user#user-123",
				sk: "plan#2026-04-13",
			},
		);
	});
});

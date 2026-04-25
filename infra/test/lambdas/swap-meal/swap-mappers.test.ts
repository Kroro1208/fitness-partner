import { describe, expect, it } from "vitest";
import {
	areSwapCandidatesValid,
	buildUpdatedPlanForSwap,
	findSwapTarget,
	isPlanStaleForProposal,
	isProposalExpired,
	pickSwapCandidate,
	toEpochSeconds,
	toIsoStringFromEpochSeconds,
} from "../../../lambdas/swap-meal/swap-mappers";
import { buildDay, buildMeal, buildPlan } from "./fixtures";

describe("swap-mappers pure core", () => {
	it("findSwapTarget は date/slot で meal を決定論的に返す", () => {
		const plan = buildPlan(0, {
			days: [buildDay("2026-04-20"), buildDay("2026-04-21")],
		});

		expect(findSwapTarget(plan, "2026-04-20", "breakfast")?.meal.title).toBe(
			"朝",
		);
		expect(findSwapTarget(plan, "2099-01-01", "breakfast")).toBeNull();
	});

	it("areSwapCandidatesValid は slot mismatch を弾く", () => {
		expect(
			areSwapCandidatesValid(
				[
					buildMeal("breakfast", "a"),
					buildMeal("breakfast", "b"),
					buildMeal("breakfast", "c"),
				],
				"breakfast",
			),
		).toBe(true);

		expect(
			areSwapCandidatesValid(
				[
					buildMeal("breakfast", "a"),
					buildMeal("lunch", "wrong"),
					buildMeal("breakfast", "c"),
				],
				"breakfast",
			),
		).toBe(false);
	});

	it("pickSwapCandidate は index 範囲外で null", () => {
		expect(pickSwapCandidate([buildMeal("breakfast", "a")], 0)?.title).toBe(
			"a",
		);
		expect(pickSwapCandidate([], 3)).toBeNull();
	});

	it("buildUpdatedPlanForSwap は daily total と revision を更新する", () => {
		const plan = buildPlan(4, {
			days: [
				buildDay("2026-04-20", {
					meals: [
						buildMeal("breakfast", "朝", { total_calories_kcal: 200 }),
						buildMeal("lunch", "昼", { total_calories_kcal: 300 }),
						buildMeal("dinner", "夕", { total_calories_kcal: 400 }),
					],
					daily_total_calories_kcal: 900,
				}),
			],
		});

		const swapped = buildUpdatedPlanForSwap(
			plan,
			"2026-04-20",
			"breakfast",
			buildMeal("breakfast", "新しい朝", { total_calories_kcal: 500 }),
		);

		expect(swapped).not.toBeNull();
		expect(swapped?.updatedDay.meals[0]?.title).toBe("新しい朝");
		expect(swapped?.updatedDay.daily_total_calories_kcal).toBe(1200);
		expect(swapped?.updatedPlan.revision).toBe(5);
	});

	it("proposal / plan / time 判定 helper は決定論的に振る舞う", () => {
		const plan = buildPlan(2);

		expect(
			isPlanStaleForProposal(plan, {
				current_plan_id: "pid-test-1",
				expected_revision: 2,
			}),
		).toBe(false);
		expect(
			isPlanStaleForProposal(plan, {
				current_plan_id: "pid-test-1",
				expected_revision: 3,
			}),
		).toBe(true);
		expect(isProposalExpired(99, 100)).toBe(true);
		expect(toEpochSeconds(new Date("2026-04-25T00:00:00Z"))).toBe(1777075200);
		expect(toIsoStringFromEpochSeconds(1777075200)).toBe(
			"2026-04-25T00:00:00.000Z",
		);
	});
});

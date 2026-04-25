import { describe, expect, it } from "vitest";

import {
	buildDailyMacroContext,
	buildProposalItem,
	recalcDailyTotals,
	replaceMealInDay,
} from "../../../lambdas/swap-meal/swap-mappers";
import { buildDay, buildMeal, buildPlan, TEST_USER_ID } from "./fixtures";

describe("buildDailyMacroContext", () => {
	it("plan.days[i].daily_total_* をそのまま original_day_total_* にコピーする", () => {
		const plan = buildPlan();
		// alcohol day を模した高カロリー日
		plan.days[0] = {
			...plan.days[0],
			daily_total_calories_kcal: 2400,
			daily_total_protein_g: 130,
			daily_total_fat_g: 80,
			daily_total_carbs_g: 250,
		};
		const ctx = buildDailyMacroContext(plan, plan.days[0].date, "breakfast");
		expect(ctx.original_day_total_calories_kcal).toBe(2400);
		expect(ctx.original_day_total_protein_g).toBe(130);
		// plan.target_calories_kcal / 7 = 2200/7 ≈ 314 にはならない
		expect(ctx.original_day_total_calories_kcal).not.toBe(Math.floor(2200 / 7));
	});

	it("other_meals_total_* は target slot 以外の meal totals 合計", () => {
		const plan = buildPlan();
		// buildDay では各 meal が cal=180、3 meal → 合計 540、target 除外後は 360
		const ctx = buildDailyMacroContext(plan, plan.days[0].date, "breakfast");
		expect(ctx.other_meals_total_calories_kcal).toBe(360);
		expect(ctx.other_meals_total_protein_g).toBe(66);
	});

	it("date が plan に存在しないと throw", () => {
		const plan = buildPlan();
		expect(() =>
			buildDailyMacroContext(plan, "2099-01-01", "breakfast"),
		).toThrow(/date not found/);
	});

	it("slot が target day に存在しないと throw", () => {
		const plan = buildPlan();
		expect(() =>
			buildDailyMacroContext(plan, plan.days[0].date, "dessert"),
		).toThrow(/slot not found/);
	});
});

describe("recalcDailyTotals", () => {
	it("meal totals を合算して新 daily_total_* を設定", () => {
		const day = buildDay("2026-04-27");
		day.meals[0] = { ...day.meals[0], total_calories_kcal: 500 };
		day.meals[1] = { ...day.meals[1], total_calories_kcal: 600 };
		day.meals[2] = { ...day.meals[2], total_calories_kcal: 700 };
		const out = recalcDailyTotals(day);
		expect(out.daily_total_calories_kcal).toBe(1800);
	});

	it("入力 day を mutate しない (immutable)", () => {
		const day = buildDay("2026-04-27");
		const snapshot = JSON.parse(JSON.stringify(day));
		recalcDailyTotals(day);
		expect(day).toEqual(snapshot);
	});
});

describe("replaceMealInDay", () => {
	it("slot 一致 meal を chosen で置換し daily_total_* を再計算", () => {
		const day = buildDay("2026-04-27");
		const chosen = buildMeal("breakfast", "代替", {
			total_calories_kcal: 900,
			total_protein_g: 50,
			total_fat_g: 20,
			total_carbs_g: 80,
		});
		const out = replaceMealInDay(day, "breakfast", chosen);
		expect(out.meals[0].title).toBe("代替");
		// breakfast(900) + lunch(180) + dinner(180) = 1260
		expect(out.daily_total_calories_kcal).toBe(1260);
		// lunch / dinner は同じ meal が残る
		expect(out.meals[1].slot).toBe("lunch");
		expect(out.meals[2].slot).toBe("dinner");
	});
});

describe("buildProposalItem", () => {
	it("current_plan_id と expected_revision を plan から持ってくる", () => {
		const plan = buildPlan(3);
		const item = buildProposalItem({
			userId: TEST_USER_ID,
			proposalId: "prop-xyz",
			weekStart: plan.week_start,
			date: plan.days[0].date,
			slot: "breakfast",
			plan,
			candidates: [
				buildMeal("breakfast", "a"),
				buildMeal("breakfast", "b"),
				buildMeal("breakfast", "c"),
			],
			nowEpochSeconds: 1_745_500_000,
		});
		expect(item.pk).toBe(`user#${TEST_USER_ID}`);
		expect(item.sk).toBe("swap_proposal#prop-xyz");
		expect(item.current_plan_id).toBe("pid-test-1");
		expect(item.expected_revision).toBe(3);
		expect(item.ttl).toBe(1_745_500_000 + 600);
		expect(item.candidates).toHaveLength(3);
	});
});

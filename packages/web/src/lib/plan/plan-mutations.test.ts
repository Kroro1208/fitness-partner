import { describe, expect, it } from "vitest";

import type { DayPlanVM, WeeklyPlanVM } from "./plan-mappers";
import { replaceDayInPlan } from "./plan-mutations";

function buildMeal(slot: DayPlanVM["meals"][number]["slot"], title: string) {
	return {
		slot,
		title,
		items: [
			{
				foodId: null,
				name: "x",
				grams: 100,
				caloriesKcal: 200,
				proteinG: 10,
				fatG: 5,
				carbsG: 20,
			},
		],
		totalCaloriesKcal: 200,
		totalProteinG: 10,
		totalFatG: 5,
		totalCarbsG: 20,
		prepTag: null as null,
		notes: null as string[] | null,
	};
}

function buildDay(date: string, theme = "test"): DayPlanVM {
	return {
		date,
		theme,
		meals: [
			buildMeal("breakfast", "朝"),
			buildMeal("lunch", "昼"),
			buildMeal("dinner", "夕"),
		],
		dailyTotalCaloriesKcal: 600,
		dailyTotalProteinG: 30,
		dailyTotalFatG: 15,
		dailyTotalCarbsG: 60,
	};
}

function buildPlan(revision = 0): WeeklyPlanVM {
	return {
		planId: "p1",
		weekStart: "2026-04-27",
		generatedAt: "2026-04-24T00:00:00Z",
		revision,
		targetCaloriesKcal: 4200,
		targetProteinG: 210,
		targetFatG: 105,
		targetCarbsG: 420,
		days: [
			buildDay("2026-04-27"),
			buildDay("2026-04-28"),
			buildDay("2026-04-29"),
			buildDay("2026-04-30"),
			buildDay("2026-05-01"),
			buildDay("2026-05-02"),
			buildDay("2026-05-03"),
		],
		snackSwaps: [],
		hydration: { targetLiters: 2.5, breakdown: [] },
		supplementRecommendations: [],
		personalRules: ["r1", "r2", "r3"],
		timelineNotes: [],
		weeklyNotes: [],
	};
}

describe("replaceDayInPlan", () => {
	it("対象日を差し替え、指定 revision に更新", () => {
		const plan = buildPlan(2);
		const updated: DayPlanVM = { ...plan.days[2], theme: "new theme" };
		const out = replaceDayInPlan(plan, updated, 3);
		expect(out.revision).toBe(3);
		expect(out.days[2].theme).toBe("new theme");
		// 他日は参照そのまま (構造共有)
		expect(out.days[0]).toBe(plan.days[0]);
		expect(out.days[1]).toBe(plan.days[1]);
	});

	it("存在しない date は plan をそのまま返す (防御的)", () => {
		const plan = buildPlan(0);
		const bogusDay: DayPlanVM = buildDay("2099-12-31");
		const out = replaceDayInPlan(plan, bogusDay, 99);
		expect(out).toBe(plan);
	});

	it("入力 plan を mutate しない", () => {
		const plan = buildPlan(0);
		const snapshot = JSON.stringify(plan);
		replaceDayInPlan(plan, buildDay("2026-04-28", "changed"), 5);
		expect(JSON.stringify(plan)).toBe(snapshot);
	});

	it("revision は server 提供値を無条件に採用 (自動 +1 しない)", () => {
		const plan = buildPlan(10);
		const out = replaceDayInPlan(plan, buildDay("2026-04-27"), 11);
		expect(out.revision).toBe(11);
		// server が 100 を返したら 100、prev+1 の計算は client でやらない
		const out2 = replaceDayInPlan(plan, buildDay("2026-04-27"), 100);
		expect(out2.revision).toBe(100);
	});
});

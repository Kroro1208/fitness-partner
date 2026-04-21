import { describe, expect, it } from "vitest";

import { weeklyPlanToVM } from "./plan-mappers";

describe("weeklyPlanToVM", () => {
	it("snake_case → camelCase", () => {
		// 追加フィールド (weekly_notes 等) は WeeklyPlanDto の structural subset に
		// 含まれないが TS は object literal に対する余剰プロパティだけをエラーにする。
		// 変数経由で渡せば structural subtype として受理されるため cast 不要。
		const dto = {
			plan_id: "p1",
			week_start: "2026-04-20",
			generated_at: "2026-04-20T00:00:00Z",
			target_calories_kcal: 2000,
			target_protein_g: 120,
			target_fat_g: 60,
			target_carbs_g: 200,
			days: [],
			weekly_notes: [],
			snack_swaps: [],
			hydration_target_liters: 2.5,
			hydration_breakdown: [],
			supplement_recommendations: [],
			personal_rules: ["a", "b", "c"],
			timeline_notes: [],
		};
		const vm = weeklyPlanToVM(dto);
		expect(vm.planId).toBe("p1");
		expect(vm.targetCaloriesKcal).toBe(2000);
		expect(vm.days).toHaveLength(0);
	});
});

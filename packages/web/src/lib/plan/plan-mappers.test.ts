import { describe, expect, it } from "vitest";

import { parseDayPlanToVM, parseWeeklyPlanToVM } from "./plan-mappers";

const baseDay = (date: string) => ({
	date,
	theme: "通常日",
	meals: [
		{
			slot: "breakfast" as const,
			title: "朝食",
			items: [
				{
					food_id: null,
					name: "オートミール",
					grams: 80,
					calories_kcal: 300,
					protein_g: 20,
					fat_g: 5,
					carbs_g: 45,
				},
			],
			total_calories_kcal: 300,
			total_protein_g: 20,
			total_fat_g: 5,
			total_carbs_g: 45,
		},
		{
			slot: "lunch" as const,
			title: "昼食",
			items: [
				{
					food_id: null,
					name: "鶏胸肉",
					grams: 150,
					calories_kcal: 250,
					protein_g: 35,
					fat_g: 6,
					carbs_g: 8,
				},
			],
			total_calories_kcal: 250,
			total_protein_g: 35,
			total_fat_g: 6,
			total_carbs_g: 8,
		},
		{
			slot: "dinner" as const,
			title: "夕食",
			items: [
				{
					food_id: null,
					name: "鮭",
					grams: 160,
					calories_kcal: 420,
					protein_g: 32,
					fat_g: 18,
					carbs_g: 25,
				},
			],
			total_calories_kcal: 420,
			total_protein_g: 32,
			total_fat_g: 18,
			total_carbs_g: 25,
		},
	],
	daily_total_calories_kcal: 970,
	daily_total_protein_g: 87,
	daily_total_fat_g: 29,
	daily_total_carbs_g: 78,
});

const baseDto = () => ({
	plan_id: "p1",
	week_start: "2026-04-20",
	generated_at: "2026-04-20T00:00:00Z",
	revision: 0,
	target_calories_kcal: 2000,
	target_protein_g: 120,
	target_fat_g: 60,
	target_carbs_g: 200,
	days: [
		baseDay("2026-04-20"),
		baseDay("2026-04-21"),
		baseDay("2026-04-22"),
		baseDay("2026-04-23"),
		baseDay("2026-04-24"),
		baseDay("2026-04-25"),
		baseDay("2026-04-26"),
	],
	weekly_notes: [],
	snack_swaps: [],
	hydration_target_liters: 2.5,
	hydration_breakdown: [],
	supplement_recommendations: [],
	personal_rules: ["a", "b", "c"],
	timeline_notes: [],
});

describe("weeklyPlanToVM", () => {
	it("snake_case → camelCase 基本", () => {
		const vm = parseWeeklyPlanToVM(baseDto());
		expect(vm.planId).toBe("p1");
		expect(vm.targetCaloriesKcal).toBe(2000);
		expect(vm.days).toHaveLength(7);
	});

	it("Plan 09: revision を VM に反映", () => {
		const vm = parseWeeklyPlanToVM({ ...baseDto(), revision: 7 });
		expect(vm.revision).toBe(7);
	});

	it("Plan 09: snack_swaps → snackSwaps camelCase", () => {
		const vm = parseWeeklyPlanToVM({
			...baseDto(),
			snack_swaps: [
				{
					current_snack: "チョコ",
					replacement: "ナッツ",
					calories_kcal: 150,
					why_it_works: "満足感",
				},
			],
		});
		expect(vm.snackSwaps).toEqual([
			{
				currentSnack: "チョコ",
				replacement: "ナッツ",
				caloriesKcal: 150,
				whyItWorks: "満足感",
			},
		]);
	});

	it("Plan 09: hydration を target + breakdown にまとめる", () => {
		const vm = parseWeeklyPlanToVM({
			...baseDto(),
			hydration_target_liters: 2.8,
			hydration_breakdown: ["起床時 500ml", "午前中 600ml"],
		});
		expect(vm.hydration).toEqual({
			targetLiters: 2.8,
			breakdown: ["起床時 500ml", "午前中 600ml"],
		});
	});

	it("Plan 09: supplement_recommendations → camelCase (dose/timing/whyRelevant/caution)", () => {
		const vm = parseWeeklyPlanToVM({
			...baseDto(),
			supplement_recommendations: [
				{
					name: "whey",
					dose: "30g",
					timing: "朝",
					why_relevant: "タンパク質補給",
					caution: "腎機能に注意",
				},
				{
					name: "omega3",
					dose: "2g",
					timing: "夕食",
					why_relevant: "魚が少ない",
					caution: null,
				},
			],
		});
		expect(vm.supplementRecommendations).toEqual([
			{
				name: "whey",
				dose: "30g",
				timing: "朝",
				whyRelevant: "タンパク質補給",
				caution: "腎機能に注意",
			},
			{
				name: "omega3",
				dose: "2g",
				timing: "夕食",
				whyRelevant: "魚が少ない",
				caution: null,
			},
		]);
	});

	it("Plan 09: personal_rules / timeline_notes / weekly_notes はそのまま array コピー", () => {
		const vm = parseWeeklyPlanToVM({
			...baseDto(),
			personal_rules: ["r1", "r2", "r3"],
			timeline_notes: ["朝食は 8:00", "夕食は 19:00"],
			weekly_notes: ["今週は batch-cook 日"],
		});
		expect(vm.personalRules).toEqual(["r1", "r2", "r3"]);
		expect(vm.timelineNotes).toEqual(["朝食は 8:00", "夕食は 19:00"]);
		expect(vm.weeklyNotes).toEqual(["今週は batch-cook 日"]);
	});

	it("必須配列が欠けた payload は fail fast で落とす", () => {
		expect(() =>
			parseWeeklyPlanToVM({
				plan_id: "p1",
				week_start: "2026-04-20",
				generated_at: "2026-04-20T00:00:00Z",
				revision: 0,
				target_calories_kcal: 2000,
				target_protein_g: 120,
				target_fat_g: 60,
				target_carbs_g: 200,
				days: [
					baseDay("2026-04-20"),
					baseDay("2026-04-21"),
					baseDay("2026-04-22"),
					baseDay("2026-04-23"),
					baseDay("2026-04-24"),
					baseDay("2026-04-25"),
					baseDay("2026-04-26"),
				],
				hydration_target_liters: 2.5,
				personal_rules: ["a", "b", "c"],
			}),
		).toThrow();
	});
});

describe("dayPlanToVM", () => {
	it("meal の notes[] を保持する (swap モーダルの why suggested 用)", () => {
		const vm = parseDayPlanToVM({
			date: "2026-04-27",
			theme: "高タンパク",
			meals: [
				{
					slot: "breakfast",
					title: "朝",
					items: [
						{
							food_id: null,
							name: "米",
							grams: 100,
							calories_kcal: 200,
							protein_g: 10,
							fat_g: 2,
							carbs_g: 30,
						},
					],
					total_calories_kcal: 200,
					total_protein_g: 10,
					total_fat_g: 2,
					total_carbs_g: 30,
					prep_tag: "quick",
					notes: ["高タンパク", "手軽"],
				},
				{
					slot: "lunch",
					title: "昼",
					items: [
						{
							food_id: null,
							name: "パン",
							grams: 100,
							calories_kcal: 200,
							protein_g: 10,
							fat_g: 2,
							carbs_g: 30,
						},
					],
					total_calories_kcal: 200,
					total_protein_g: 10,
					total_fat_g: 2,
					total_carbs_g: 30,
				},
				{
					slot: "dinner",
					title: "夕",
					items: [
						{
							food_id: null,
							name: "パスタ",
							grams: 100,
							calories_kcal: 200,
							protein_g: 10,
							fat_g: 2,
							carbs_g: 30,
						},
					],
					total_calories_kcal: 200,
					total_protein_g: 10,
					total_fat_g: 2,
					total_carbs_g: 30,
				},
			],
			daily_total_calories_kcal: 600,
			daily_total_protein_g: 30,
			daily_total_fat_g: 6,
			daily_total_carbs_g: 90,
		});
		expect(vm.meals[0].notes).toEqual(["高タンパク", "手軽"]);
		expect(vm.meals[1].notes).toBeNull();
	});
});

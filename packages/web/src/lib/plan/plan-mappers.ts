import type { WeeklyPlanSchema } from "@fitness/contracts-ts";
import type { z } from "zod";

type WeeklyPlanDto = z.input<typeof WeeklyPlanSchema>;
type DayPlanDto = WeeklyPlanDto["days"][number];
type MealDto = DayPlanDto["meals"][number];
type MealItemDto = MealDto["items"][number];

export interface MealItemVM {
	foodId: string | null;
	name: string;
	grams: number;
	caloriesKcal: number;
	proteinG: number;
	fatG: number;
	carbsG: number;
}

export interface MealVM {
	slot: "breakfast" | "lunch" | "dinner" | "dessert";
	title: string;
	items: MealItemVM[];
	totalCaloriesKcal: number;
	totalProteinG: number;
	totalFatG: number;
	totalCarbsG: number;
	prepTag: "batch" | "quick" | "treat" | "none" | null;
}

export interface DayPlanVM {
	date: string;
	theme: string;
	meals: MealVM[];
	dailyTotalCaloriesKcal: number;
	dailyTotalProteinG: number;
	dailyTotalFatG: number;
	dailyTotalCarbsG: number;
}

export interface WeeklyPlanVM {
	planId: string;
	weekStart: string;
	generatedAt: string;
	targetCaloriesKcal: number;
	targetProteinG: number;
	targetFatG: number;
	targetCarbsG: number;
	days: DayPlanVM[];
}

const mealItemToVM = (i: MealItemDto): MealItemVM => ({
	foodId: i.food_id ?? null,
	name: i.name,
	grams: i.grams,
	caloriesKcal: i.calories_kcal,
	proteinG: i.protein_g,
	fatG: i.fat_g,
	carbsG: i.carbs_g,
});

const mealToVM = (m: MealDto): MealVM => ({
	slot: m.slot,
	title: m.title,
	items: m.items.map(mealItemToVM),
	totalCaloriesKcal: m.total_calories_kcal,
	totalProteinG: m.total_protein_g,
	totalFatG: m.total_fat_g,
	totalCarbsG: m.total_carbs_g,
	prepTag: m.prep_tag ?? null,
});

const dayToVM = (d: DayPlanDto): DayPlanVM => ({
	date: d.date,
	theme: d.theme,
	meals: d.meals.map(mealToVM),
	dailyTotalCaloriesKcal: d.daily_total_calories_kcal,
	dailyTotalProteinG: d.daily_total_protein_g,
	dailyTotalFatG: d.daily_total_fat_g,
	dailyTotalCarbsG: d.daily_total_carbs_g,
});

export function weeklyPlanToVM(p: WeeklyPlanDto): WeeklyPlanVM {
	return {
		planId: p.plan_id,
		weekStart: p.week_start,
		generatedAt: p.generated_at,
		targetCaloriesKcal: p.target_calories_kcal,
		targetProteinG: p.target_protein_g,
		targetFatG: p.target_fat_g,
		targetCarbsG: p.target_carbs_g,
		days: p.days.map(dayToVM),
	};
}

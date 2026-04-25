import {
	DayPlanSchema,
	MealSchema,
	WeeklyPlanSchema,
} from "@fitness/contracts-ts";
import type { z } from "zod";

const WeeklyPlanForVMSchema = WeeklyPlanSchema.required({
	weekly_notes: true,
	snack_swaps: true,
	hydration_breakdown: true,
	supplement_recommendations: true,
	timeline_notes: true,
});

type WeeklyPlanDto = z.output<typeof WeeklyPlanForVMSchema>;
type MealItemDto = z.output<typeof MealSchema>["items"][number];
type SnackSwapDto = WeeklyPlanDto["snack_swaps"][number];
type SupplementDto = WeeklyPlanDto["supplement_recommendations"][number];

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
	notes: string[] | null;
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

export interface SnackSwapVM {
	currentSnack: string;
	replacement: string;
	caloriesKcal: number;
	whyItWorks: string;
}

export interface HydrationVM {
	targetLiters: number;
	breakdown: string[];
}

export interface SupplementRecommendationVM {
	name: string;
	dose: string;
	timing: string;
	whyRelevant: string;
	caution: string | null;
}

export interface WeeklyPlanVM {
	planId: string;
	weekStart: string;
	generatedAt: string;
	revision: number;
	targetCaloriesKcal: number;
	targetProteinG: number;
	targetFatG: number;
	targetCarbsG: number;
	days: DayPlanVM[];
	snackSwaps: SnackSwapVM[];
	hydration: HydrationVM;
	supplementRecommendations: SupplementRecommendationVM[];
	personalRules: string[];
	timelineNotes: string[];
	weeklyNotes: string[];
}

const mealItemToVM = (i: MealItemDto): MealItemVM => ({
	foodId: i.food_id,
	name: i.name,
	grams: i.grams,
	caloriesKcal: i.calories_kcal,
	proteinG: i.protein_g,
	fatG: i.fat_g,
	carbsG: i.carbs_g,
});

export function parseMealToVM(raw: z.input<typeof MealSchema>): MealVM {
	const parsed = MealSchema.parse(raw);
	return {
		slot: parsed.slot,
		title: parsed.title,
		items: parsed.items.map(mealItemToVM),
		totalCaloriesKcal: parsed.total_calories_kcal,
		totalProteinG: parsed.total_protein_g,
		totalFatG: parsed.total_fat_g,
		totalCarbsG: parsed.total_carbs_g,
		prepTag: parsed.prep_tag,
		notes: parsed.notes,
	};
}

export function parseDayPlanToVM(
	raw: z.input<typeof DayPlanSchema>,
): DayPlanVM {
	const d = DayPlanSchema.parse(raw);
	return {
		date: d.date,
		theme: d.theme,
		meals: d.meals.map(parseMealToVM),
		dailyTotalCaloriesKcal: d.daily_total_calories_kcal,
		dailyTotalProteinG: d.daily_total_protein_g,
		dailyTotalFatG: d.daily_total_fat_g,
		dailyTotalCarbsG: d.daily_total_carbs_g,
	};
}

const snackSwapToVM = (s: SnackSwapDto): SnackSwapVM => ({
	currentSnack: s.current_snack,
	replacement: s.replacement,
	caloriesKcal: s.calories_kcal,
	whyItWorks: s.why_it_works,
});

const supplementToVM = (s: SupplementDto): SupplementRecommendationVM => ({
	name: s.name,
	dose: s.dose,
	timing: s.timing,
	whyRelevant: s.why_relevant,
	caution: s.caution,
});

export function parseWeeklyPlanToVM(raw: unknown): WeeklyPlanVM {
	const p = WeeklyPlanForVMSchema.parse(raw);
	return {
		planId: p.plan_id,
		weekStart: p.week_start,
		generatedAt: p.generated_at,
		revision: p.revision,
		targetCaloriesKcal: p.target_calories_kcal,
		targetProteinG: p.target_protein_g,
		targetFatG: p.target_fat_g,
		targetCarbsG: p.target_carbs_g,
		days: p.days.map(parseDayPlanToVM),
		snackSwaps: p.snack_swaps.map(snackSwapToVM),
		hydration: {
			targetLiters: p.hydration_target_liters,
			breakdown: p.hydration_breakdown,
		},
		supplementRecommendations: p.supplement_recommendations.map(supplementToVM),
		personalRules: p.personal_rules,
		timelineNotes: p.timeline_notes,
		weeklyNotes: p.weekly_notes,
	};
}

import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { makeEvent } from "../helpers/api-event";

export const completeProfileItem = {
	pk: "user#u1",
	sk: "profile",
	onboarding_stage: "complete",
	age: 30,
	sex: "male",
	height_cm: 170,
	weight_kg: 70,
	job_type: "desk",
	workouts_per_week: 3,
	workout_types: [],
	sleep_hours: 7,
	stress_level: "low",
	favorite_meals: [],
	hated_foods: [],
	restrictions: [],
	current_snacks: [],
	alcohol_per_week: null,
};

/**
 * 既存 `makeEvent` helper に Plan 08 generate-plan 用のデフォルト
 * (POST /users/me/plans/generate, sub=u1, body={}) を被せた wrapper。
 * cast 不要な型安全ファクトリ。
 */
export function makeAuthEvent(
	overrides: { body?: string; sub?: string; noAuth?: boolean } = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
	return makeEvent({
		method: "POST",
		path: "/users/me/plans/generate",
		sub: overrides.sub ?? "u1",
		body: overrides.body ?? "{}",
		noAuth: overrides.noAuth,
	});
}

/**
 * GeneratedWeeklyPlanSchema.strict() を通す最小形状の 7 日分固定 plan。
 * 上書きは `overrides` で部分上書き可能。
 */
export function makeGeneratedPlan(overrides: Record<string, unknown> = {}) {
	const item = {
		food_id: null,
		name: "鶏むね",
		grams: 150,
		calories_kcal: 180,
		protein_g: 33,
		fat_g: 3,
		carbs_g: 0,
	};
	const meal = {
		slot: "breakfast",
		title: "朝食",
		items: [item],
		total_calories_kcal: 180,
		total_protein_g: 33,
		total_fat_g: 3,
		total_carbs_g: 0,
	};
	const day = {
		date: "2026-04-20",
		theme: "高タンパク",
		meals: [meal, { ...meal, slot: "lunch" }, { ...meal, slot: "dinner" }],
		daily_total_calories_kcal: 540,
		daily_total_protein_g: 99,
		daily_total_fat_g: 9,
		daily_total_carbs_g: 0,
	};
	return {
		target_calories_kcal: 2200,
		target_protein_g: 140,
		target_fat_g: 70,
		target_carbs_g: 240,
		days: Array.from({ length: 7 }, (_, i) => ({
			...day,
			date: `2026-04-${String(20 + i).padStart(2, "0")}`,
		})),
		weekly_notes: [],
		snack_swaps: [],
		hydration_target_liters: 2.5,
		hydration_breakdown: [],
		supplement_recommendations: [],
		personal_rules: ["a", "b", "c"],
		timeline_notes: [],
		...overrides,
	};
}

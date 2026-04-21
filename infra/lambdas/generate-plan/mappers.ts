import {
	type CompleteProfileForPlan,
	type SafeAgentInput,
	type SafePromptProfile,
	SafePromptProfileSchema,
} from "@fitness/contracts-ts";

export type JobType =
	| "desk"
	| "standing"
	| "light_physical"
	| "manual_labour"
	| "outdoor";
export type ActivityLevel =
	| "sedentary"
	| "lightly_active"
	| "moderately_active"
	| "very_active"
	| "extremely_active";

const HEAVY: ReadonlySet<JobType> = new Set(["manual_labour", "outdoor"]);

/**
 * 週次運動頻度と職業タイプから MET 相当の activity_level を導出する。
 * FitnessEngine の TDEE 計算入力として使用。
 */
export function deriveActivityLevel(
	workoutsPerWeek: number,
	jobType: JobType,
): ActivityLevel {
	const heavy = HEAVY.has(jobType);
	if (workoutsPerWeek === 0) return heavy ? "lightly_active" : "sedentary";
	if (workoutsPerWeek <= 2) return "lightly_active";
	if (workoutsPerWeek <= 4) return heavy ? "very_active" : "moderately_active";
	if (workoutsPerWeek <= 6) return "very_active";
	return "extremely_active";
}

/**
 * 実測データ無しでの平均運動時間推定。筋トレ中心の高頻度は 60 分、
 * 種目未指定の高頻度は 30 分 (短時間 HIIT 想定)、それ以外は 45 分既定。
 */
export function deriveAvgWorkoutMinutes(
	workoutTypes: readonly string[],
	workoutsPerWeek: number,
): number {
	const tokens = workoutTypes.map((t) => t.toLowerCase());
	const isLifting = tokens.some(
		(t) => t.includes("weight") || t.includes("筋トレ"),
	);
	if (isLifting && workoutsPerWeek >= 3) return 60;
	if (workoutTypes.length === 0 && workoutsPerWeek >= 3) return 30;
	return 45;
}

function deriveEarlyMorning(workoutTypes: readonly string[]): boolean {
	const t = workoutTypes.map((x) => x.toLowerCase());
	return t.some((x) => x.includes("早朝") || x.includes("morning"));
}

const SAFE_PROMPT_KEYS = [
	"name",
	"age",
	"sex",
	"height_cm",
	"weight_kg",
	"goal_weight_kg",
	"goal_description",
	"desired_pace",
	"favorite_meals",
	"hated_foods",
	"restrictions",
	"cooking_preference",
	"food_adventurousness",
	"current_snacks",
	"snacking_reason",
	"snack_taste_preference",
	"late_night_snacking",
	"eating_out_style",
	"budget_level",
	"meal_frequency_preference",
	"location_region",
	"kitchen_access",
	"convenience_store_usage",
] as const;

/**
 * DynamoDB 行は `CompleteProfileForPlan` (Zod `.catchall(z.any())`) でパース済み。
 * contracts-ts 側で `[k: string]: unknown` が既に付いているため、
 * mapper 内で `Record<string, unknown>` との交差は不要 — 契約外フィールドも
 * そのままインデックスアクセスで読める。最終値は SafePromptProfileSchema.parse で
 * 検証されるため、ここで cast を重ねる必要はない。
 */
type Profile = CompleteProfileForPlan;

function pickOptionalSafeFields(profile: Profile): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const k of SAFE_PROMPT_KEYS) {
		const v = profile[k];
		if (v !== null && v !== undefined) out[k] = v;
	}
	return out;
}

function stringArrayOrEmpty(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((item): item is string => typeof item === "string");
}

/**
 * LLM プロンプト同梱用の安全化プロファイル。
 * medical_condition_note / medication_note などの PII / 生ノートは
 * 絶対に含めず、抽象フラグ (avoid_alcohol, avoid_supplements_without_consultation)
 * に畳み込む。`SafePromptProfileSchema.parse` で戻り値の shape と型を確定する。
 */
export function toSafePromptProfile(profile: Profile): SafePromptProfile {
	const avoidAlcohol =
		profile.alcohol_per_week === "none" || profile.alcohol_per_week === "0";
	const avoidSupplements =
		Boolean(profile.has_medical_condition) ||
		Boolean(profile.has_doctor_diet_restriction);

	return SafePromptProfileSchema.parse({
		...pickOptionalSafeFields(profile),
		age: profile.age,
		sex: profile.sex,
		height_cm: profile.height_cm,
		weight_kg: profile.weight_kg,
		favorite_meals: stringArrayOrEmpty(profile.favorite_meals),
		hated_foods: stringArrayOrEmpty(profile.hated_foods),
		restrictions: stringArrayOrEmpty(profile.restrictions),
		current_snacks: stringArrayOrEmpty(profile.current_snacks),
		avoid_alcohol: avoidAlcohol,
		avoid_supplements_without_consultation: avoidSupplements,
	});
}

/**
 * FitnessEngine 計算モジュール (calorie/macro, hydration, supplement) への
 * 数値入力を組み立てる。
 *
 * - protein_gap_g: Plan 08 では meal 生成前に実 gap を測れないため 0 固定
 *   (whey 推奨抑止)。Plan 09+ で meal 生成後の実測値に切替予定。
 * - low_sunlight_exposure: MVP では地域判定せず false 固定。
 */
export function toSafeAgentInput(profile: Profile): SafeAgentInput {
	const workoutTypes = stringArrayOrEmpty(profile.workout_types);
	const activityLevel = deriveActivityLevel(
		profile.workouts_per_week,
		profile.job_type,
	);
	const avgMin = deriveAvgWorkoutMinutes(
		workoutTypes,
		profile.workouts_per_week,
	);
	return {
		calorie_macro_input: {
			age: profile.age,
			sex: profile.sex,
			height_cm: profile.height_cm,
			weight_kg: profile.weight_kg,
			activity_level: activityLevel,
			sleep_hours: profile.sleep_hours,
			stress_level: profile.stress_level,
		},
		hydration_input: {
			weight_kg: profile.weight_kg,
			workouts_per_week: profile.workouts_per_week,
			avg_workout_minutes: avgMin,
			job_type: profile.job_type,
		},
		supplement_input: {
			protein_gap_g: 0,
			workouts_per_week: profile.workouts_per_week,
			sleep_hours: profile.sleep_hours,
			fish_per_week: 2,
			early_morning_training: deriveEarlyMorning(workoutTypes),
			low_sunlight_exposure: false,
		},
	};
}

import type {
	UpdateUserProfileInput,
	UserProfile,
} from "@fitness/contracts-ts";

import type { OnboardingStage } from "@/lib/onboarding/stage-routing";

export type { OnboardingStage } from "@/lib/onboarding/stage-routing";

/**
 * camelCase ViewModel 版 UserProfile。
 *
 * contracts-ts 由来の `UserProfile` は snake_case を保つ一方、React / hook /
 * Server Component / local state では camelCase に統一する。boundary
 * (`useProfile`, `useUpdateProfile`, `getProfileServerSide`) で DTO ↔ ViewModel
 * 変換をここで吸収する。
 *
 * 全フィールド optional。`null` は「明示的にクリア済み」を表す。
 * `onboardingStage` は `UserProfile.onboarding_stage` と同じく `"complete"`
 * を含み、`OnboardingStage` より広い。
 */
export interface OnboardingProfile {
	name?: string | null;
	age?: number | null;
	sex?: "male" | "female" | null;
	heightCm?: number | null;
	weightKg?: number | null;
	goalWeightKg?: number | null;
	goalDescription?: string | null;
	desiredPace?: "steady" | "aggressive" | null;
	activityLevel?:
		| "sedentary"
		| "lightly_active"
		| "moderately_active"
		| "very_active"
		| "extremely_active"
		| null;
	jobType?:
		| "desk"
		| "standing"
		| "light_physical"
		| "manual_labour"
		| "outdoor"
		| null;
	workoutsPerWeek?: number | null;
	workoutTypes?: string[] | null;
	sleepHours?: number | null;
	stressLevel?: "low" | "moderate" | "high" | null;
	alcoholPerWeek?: string | null;
	favoriteMeals?: UserProfile["favorite_meals"];
	hatedFoods?: string[] | null;
	restrictions?: string[] | null;
	cookingPreference?: "scratch" | "quick" | "batch" | "mixed" | null;
	foodAdventurousness?: number | null;
	currentSnacks?: string[] | null;
	snackingReason?: "hunger" | "boredom" | "habit" | "mixed" | null;
	snackTastePreference?: "sweet" | "savory" | "both" | null;
	lateNightSnacking?: boolean | null;
	eatingOutStyle?: "mostly_home" | "mostly_eating_out" | "mixed" | null;
	budgetLevel?: "low" | "medium" | "high" | null;
	mealFrequencyPreference?: number | null;
	locationRegion?: string | null;
	kitchenAccess?: string | null;
	convenienceStoreUsage?: "low" | "medium" | "high" | null;
	hasMedicalCondition?: boolean | null;
	isUnderTreatment?: boolean | null;
	onMedication?: boolean | null;
	isPregnantOrBreastfeeding?: boolean | null;
	hasDoctorDietRestriction?: boolean | null;
	hasEatingDisorderHistory?: boolean | null;
	medicalConditionNote?: string | null;
	medicationNote?: string | null;
	onboardingStage?: OnboardingStage | "complete" | null;
	blockedReason?: string | null;
	preferencesNote?: string | null;
	snacksNote?: string | null;
	lifestyleNote?: string | null;
	updatedAt?: string | null;
}

/**
 * PATCH 用の camelCase patch。
 *
 * `OnboardingProfile` と同じ shape。フィールド未指定 (`undefined`) は
 * 「触らない」セマンティクス、`null` は「明示的にクリア」。
 */
export type OnboardingProfilePatch = Omit<OnboardingProfile, "updatedAt">;

type SnakeProfileField = keyof UserProfile;
type SnakeProfileInput = Partial<{
	[K in SnakeProfileField]: K extends "favorite_meals"
		? UserProfile[K] | string[] | null
		: UserProfile[K];
}>;
type FavoriteMeals = NonNullable<UserProfile["favorite_meals"]>;

function normalizeFavoriteMeals(
	value: SnakeProfileInput["favorite_meals"],
): UserProfile["favorite_meals"] | undefined {
	if (value === undefined) return undefined;
	if (value === null) return null;

	const trimmed = value.slice(0, 5);
	switch (trimmed.length) {
		case 0:
			return [];
		case 1:
			return [trimmed[0]];
		case 2:
			return [trimmed[0], trimmed[1]];
		case 3:
			return [trimmed[0], trimmed[1], trimmed[2]];
		case 4:
			return [trimmed[0], trimmed[1], trimmed[2], trimmed[3]];
		default:
			return [
				trimmed[0],
				trimmed[1],
				trimmed[2],
				trimmed[3],
				trimmed[4],
			] satisfies FavoriteMeals;
	}
}

/**
 * snake_case キー → camelCase キー のマッピング。
 *
 * 43 フィールド。`UserProfile` のすべてを網羅する。`toOnboardingProfile` /
 * `toProfilePatchDto` / `toCoachPromptRequestDto` / `toFreeTextParseRequestDto`
 * が参照する唯一の正規テーブル。
 */
export const FIELD_MAP_SNAKE_TO_CAMEL = {
	name: "name",
	age: "age",
	sex: "sex",
	height_cm: "heightCm",
	weight_kg: "weightKg",
	goal_weight_kg: "goalWeightKg",
	goal_description: "goalDescription",
	desired_pace: "desiredPace",
	activity_level: "activityLevel",
	job_type: "jobType",
	workouts_per_week: "workoutsPerWeek",
	workout_types: "workoutTypes",
	sleep_hours: "sleepHours",
	stress_level: "stressLevel",
	alcohol_per_week: "alcoholPerWeek",
	favorite_meals: "favoriteMeals",
	hated_foods: "hatedFoods",
	restrictions: "restrictions",
	cooking_preference: "cookingPreference",
	food_adventurousness: "foodAdventurousness",
	current_snacks: "currentSnacks",
	snacking_reason: "snackingReason",
	snack_taste_preference: "snackTastePreference",
	late_night_snacking: "lateNightSnacking",
	eating_out_style: "eatingOutStyle",
	budget_level: "budgetLevel",
	meal_frequency_preference: "mealFrequencyPreference",
	location_region: "locationRegion",
	kitchen_access: "kitchenAccess",
	convenience_store_usage: "convenienceStoreUsage",
	has_medical_condition: "hasMedicalCondition",
	is_under_treatment: "isUnderTreatment",
	on_medication: "onMedication",
	is_pregnant_or_breastfeeding: "isPregnantOrBreastfeeding",
	has_doctor_diet_restriction: "hasDoctorDietRestriction",
	has_eating_disorder_history: "hasEatingDisorderHistory",
	medical_condition_note: "medicalConditionNote",
	medication_note: "medicationNote",
	onboarding_stage: "onboardingStage",
	blocked_reason: "blockedReason",
	preferences_note: "preferencesNote",
	snacks_note: "snacksNote",
	lifestyle_note: "lifestyleNote",
	updated_at: "updatedAt",
} satisfies Record<SnakeProfileField, keyof OnboardingProfile>;

/**
 * camelCase キー → snake_case キー のマッピング。
 * FIELD_MAP_SNAKE_TO_CAMEL の逆写像。生成は静的に行い、導出ミスを避ける。
 */
export const FIELD_MAP_CAMEL_TO_SNAKE = {
	name: "name",
	age: "age",
	sex: "sex",
	heightCm: "height_cm",
	weightKg: "weight_kg",
	goalWeightKg: "goal_weight_kg",
	goalDescription: "goal_description",
	desiredPace: "desired_pace",
	activityLevel: "activity_level",
	jobType: "job_type",
	workoutsPerWeek: "workouts_per_week",
	workoutTypes: "workout_types",
	sleepHours: "sleep_hours",
	stressLevel: "stress_level",
	alcoholPerWeek: "alcohol_per_week",
	favoriteMeals: "favorite_meals",
	hatedFoods: "hated_foods",
	restrictions: "restrictions",
	cookingPreference: "cooking_preference",
	foodAdventurousness: "food_adventurousness",
	currentSnacks: "current_snacks",
	snackingReason: "snacking_reason",
	snackTastePreference: "snack_taste_preference",
	lateNightSnacking: "late_night_snacking",
	eatingOutStyle: "eating_out_style",
	budgetLevel: "budget_level",
	mealFrequencyPreference: "meal_frequency_preference",
	locationRegion: "location_region",
	kitchenAccess: "kitchen_access",
	convenienceStoreUsage: "convenience_store_usage",
	hasMedicalCondition: "has_medical_condition",
	isUnderTreatment: "is_under_treatment",
	onMedication: "on_medication",
	isPregnantOrBreastfeeding: "is_pregnant_or_breastfeeding",
	hasDoctorDietRestriction: "has_doctor_diet_restriction",
	hasEatingDisorderHistory: "has_eating_disorder_history",
	medicalConditionNote: "medical_condition_note",
	medicationNote: "medication_note",
	onboardingStage: "onboarding_stage",
	blockedReason: "blocked_reason",
	preferencesNote: "preferences_note",
	snacksNote: "snacks_note",
	lifestyleNote: "lifestyle_note",
	updatedAt: "updated_at",
} satisfies Record<keyof OnboardingProfile, SnakeProfileField>;

/**
 * snake_case DTO を camelCase ViewModel に変換する。
 * 未知のキーは無視する (forward-compat)。`null` プロファイルは `null` を返す。
 *
 * 入力型は `UserProfile` の構造的サブセットを受け入れる。
 * extra field を持つ object も構造的部分型としてそのまま渡せるため、
 * forward-compat の未知キーは型バイパスなしで無視できる。
 */
export function toOnboardingProfile(
	snake: SnakeProfileInput | null | undefined,
): OnboardingProfile | null {
	if (snake === null || snake === undefined) return null;
	const result: OnboardingProfile = {};
	if (snake.name !== undefined) result.name = snake.name;
	if (snake.age !== undefined) result.age = snake.age;
	if (snake.sex !== undefined) result.sex = snake.sex;
	if (snake.height_cm !== undefined) result.heightCm = snake.height_cm;
	if (snake.weight_kg !== undefined) result.weightKg = snake.weight_kg;
	if (snake.goal_weight_kg !== undefined) {
		result.goalWeightKg = snake.goal_weight_kg;
	}
	if (snake.goal_description !== undefined) {
		result.goalDescription = snake.goal_description;
	}
	if (snake.desired_pace !== undefined) {
		result.desiredPace = snake.desired_pace;
	}
	if (snake.activity_level !== undefined) {
		result.activityLevel = snake.activity_level;
	}
	if (snake.job_type !== undefined) result.jobType = snake.job_type;
	if (snake.workouts_per_week !== undefined) {
		result.workoutsPerWeek = snake.workouts_per_week;
	}
	if (snake.workout_types !== undefined)
		result.workoutTypes = snake.workout_types;
	if (snake.sleep_hours !== undefined) result.sleepHours = snake.sleep_hours;
	if (snake.stress_level !== undefined) result.stressLevel = snake.stress_level;
	if (snake.alcohol_per_week !== undefined) {
		result.alcoholPerWeek = snake.alcohol_per_week;
	}
	const favoriteMeals = normalizeFavoriteMeals(snake.favorite_meals);
	if (favoriteMeals !== undefined) result.favoriteMeals = favoriteMeals;
	if (snake.hated_foods !== undefined) result.hatedFoods = snake.hated_foods;
	if (snake.restrictions !== undefined)
		result.restrictions = snake.restrictions;
	if (snake.cooking_preference !== undefined) {
		result.cookingPreference = snake.cooking_preference;
	}
	if (snake.food_adventurousness !== undefined) {
		result.foodAdventurousness = snake.food_adventurousness;
	}
	if (snake.current_snacks !== undefined)
		result.currentSnacks = snake.current_snacks;
	if (snake.snacking_reason !== undefined) {
		result.snackingReason = snake.snacking_reason;
	}
	if (snake.snack_taste_preference !== undefined) {
		result.snackTastePreference = snake.snack_taste_preference;
	}
	if (snake.late_night_snacking !== undefined) {
		result.lateNightSnacking = snake.late_night_snacking;
	}
	if (snake.eating_out_style !== undefined) {
		result.eatingOutStyle = snake.eating_out_style;
	}
	if (snake.budget_level !== undefined) result.budgetLevel = snake.budget_level;
	if (snake.meal_frequency_preference !== undefined) {
		result.mealFrequencyPreference = snake.meal_frequency_preference;
	}
	if (snake.location_region !== undefined) {
		result.locationRegion = snake.location_region;
	}
	if (snake.kitchen_access !== undefined)
		result.kitchenAccess = snake.kitchen_access;
	if (snake.convenience_store_usage !== undefined) {
		result.convenienceStoreUsage = snake.convenience_store_usage;
	}
	if (snake.has_medical_condition !== undefined) {
		result.hasMedicalCondition = snake.has_medical_condition;
	}
	if (snake.is_under_treatment !== undefined) {
		result.isUnderTreatment = snake.is_under_treatment;
	}
	if (snake.on_medication !== undefined)
		result.onMedication = snake.on_medication;
	if (snake.is_pregnant_or_breastfeeding !== undefined) {
		result.isPregnantOrBreastfeeding = snake.is_pregnant_or_breastfeeding;
	}
	if (snake.has_doctor_diet_restriction !== undefined) {
		result.hasDoctorDietRestriction = snake.has_doctor_diet_restriction;
	}
	if (snake.has_eating_disorder_history !== undefined) {
		result.hasEatingDisorderHistory = snake.has_eating_disorder_history;
	}
	if (snake.medical_condition_note !== undefined) {
		result.medicalConditionNote = snake.medical_condition_note;
	}
	if (snake.medication_note !== undefined) {
		result.medicationNote = snake.medication_note;
	}
	if (snake.onboarding_stage !== undefined) {
		result.onboardingStage = snake.onboarding_stage;
	}
	if (snake.blocked_reason !== undefined)
		result.blockedReason = snake.blocked_reason;
	if (snake.preferences_note !== undefined) {
		result.preferencesNote = snake.preferences_note;
	}
	if (snake.snacks_note !== undefined) result.snacksNote = snake.snacks_note;
	if (snake.lifestyle_note !== undefined) {
		result.lifestyleNote = snake.lifestyle_note;
	}
	if (snake.updated_at !== undefined) result.updatedAt = snake.updated_at;

	return result;
}

/**
 * camelCase patch を snake_case PATCH DTO に変換する。
 *
 * `undefined` フィールドは出力から除外し、`null` はクリア指示として残す。
 * マップにない camelCase キーは無視する。
 */
export function toProfilePatchDto(
	camel: Partial<OnboardingProfilePatch>,
): UpdateUserProfileInput {
	const result: UpdateUserProfileInput = {};
	if (camel.name !== undefined) result.name = camel.name;
	if (camel.age !== undefined) result.age = camel.age;
	if (camel.sex !== undefined) result.sex = camel.sex;
	if (camel.heightCm !== undefined) result.height_cm = camel.heightCm;
	if (camel.weightKg !== undefined) result.weight_kg = camel.weightKg;
	if (camel.goalWeightKg !== undefined) {
		result.goal_weight_kg = camel.goalWeightKg;
	}
	if (camel.goalDescription !== undefined) {
		result.goal_description = camel.goalDescription;
	}
	if (camel.desiredPace !== undefined) {
		result.desired_pace = camel.desiredPace;
	}
	if (camel.activityLevel !== undefined) {
		result.activity_level = camel.activityLevel;
	}
	if (camel.jobType !== undefined) result.job_type = camel.jobType;
	if (camel.workoutsPerWeek !== undefined) {
		result.workouts_per_week = camel.workoutsPerWeek;
	}
	if (camel.workoutTypes !== undefined)
		result.workout_types = camel.workoutTypes;
	if (camel.sleepHours !== undefined) result.sleep_hours = camel.sleepHours;
	if (camel.stressLevel !== undefined) result.stress_level = camel.stressLevel;
	if (camel.alcoholPerWeek !== undefined) {
		result.alcohol_per_week = camel.alcoholPerWeek;
	}
	if (camel.favoriteMeals !== undefined)
		result.favorite_meals = camel.favoriteMeals;
	if (camel.hatedFoods !== undefined) result.hated_foods = camel.hatedFoods;
	if (camel.restrictions !== undefined)
		result.restrictions = camel.restrictions;
	if (camel.cookingPreference !== undefined) {
		result.cooking_preference = camel.cookingPreference;
	}
	if (camel.foodAdventurousness !== undefined) {
		result.food_adventurousness = camel.foodAdventurousness;
	}
	if (camel.currentSnacks !== undefined)
		result.current_snacks = camel.currentSnacks;
	if (camel.snackingReason !== undefined) {
		result.snacking_reason = camel.snackingReason;
	}
	if (camel.snackTastePreference !== undefined) {
		result.snack_taste_preference = camel.snackTastePreference;
	}
	if (camel.lateNightSnacking !== undefined) {
		result.late_night_snacking = camel.lateNightSnacking;
	}
	if (camel.eatingOutStyle !== undefined) {
		result.eating_out_style = camel.eatingOutStyle;
	}
	if (camel.budgetLevel !== undefined) result.budget_level = camel.budgetLevel;
	if (camel.mealFrequencyPreference !== undefined) {
		result.meal_frequency_preference = camel.mealFrequencyPreference;
	}
	if (camel.locationRegion !== undefined) {
		result.location_region = camel.locationRegion;
	}
	if (camel.kitchenAccess !== undefined)
		result.kitchen_access = camel.kitchenAccess;
	if (camel.convenienceStoreUsage !== undefined) {
		result.convenience_store_usage = camel.convenienceStoreUsage;
	}
	if (camel.hasMedicalCondition !== undefined) {
		result.has_medical_condition = camel.hasMedicalCondition;
	}
	if (camel.isUnderTreatment !== undefined) {
		result.is_under_treatment = camel.isUnderTreatment;
	}
	if (camel.onMedication !== undefined)
		result.on_medication = camel.onMedication;
	if (camel.isPregnantOrBreastfeeding !== undefined) {
		result.is_pregnant_or_breastfeeding = camel.isPregnantOrBreastfeeding;
	}
	if (camel.hasDoctorDietRestriction !== undefined) {
		result.has_doctor_diet_restriction = camel.hasDoctorDietRestriction;
	}
	if (camel.hasEatingDisorderHistory !== undefined) {
		result.has_eating_disorder_history = camel.hasEatingDisorderHistory;
	}
	if (camel.medicalConditionNote !== undefined) {
		result.medical_condition_note = camel.medicalConditionNote;
	}
	if (camel.medicationNote !== undefined) {
		result.medication_note = camel.medicationNote;
	}
	if (camel.onboardingStage !== undefined) {
		result.onboarding_stage = camel.onboardingStage;
	}
	if (camel.blockedReason !== undefined)
		result.blocked_reason = camel.blockedReason;
	if (camel.preferencesNote !== undefined) {
		result.preferences_note = camel.preferencesNote;
	}
	if (camel.snacksNote !== undefined) result.snacks_note = camel.snacksNote;
	if (camel.lifestyleNote !== undefined) {
		result.lifestyle_note = camel.lifestyleNote;
	}

	return result;
}

/**
 * camelCase スナップショットを snake_case に変換してから Coach prompt の
 * Route Handler へ渡す DTO を組み立てる。
 */
export function toCoachPromptRequestDto(
	targetStage: OnboardingStage,
	snapshot: Partial<OnboardingProfile>,
): {
	target_stage: OnboardingStage;
	profile_snapshot: Record<string, unknown>;
} {
	return {
		target_stage: targetStage,
		profile_snapshot: camelSnapshotToSnake(snapshot),
	};
}

/**
 * Coach prompt の query key 用に、snapshot を順序安定な文字列へ変換する。
 * profile の更新に応じて prompt cache を分離し、文脈ずれを防ぐ。
 */
export function toProfileSnapshotCacheKey(
	snapshot: Partial<OnboardingProfile>,
): string {
	return JSON.stringify(
		Object.entries(camelSnapshotToSnake(snapshot)).sort(([left], [right]) =>
			left.localeCompare(right),
		),
	);
}

/**
 * Free-text parse Route Handler 用 DTO。
 */
export function toFreeTextParseRequestDto(
	stage: "lifestyle" | "preferences" | "snacks",
	freeText: string,
	snapshot: Partial<OnboardingProfile>,
): {
	stage: "lifestyle" | "preferences" | "snacks";
	free_text: string;
	structured_snapshot: Record<string, unknown>;
} {
	return {
		stage,
		free_text: freeText,
		structured_snapshot: camelSnapshotToSnake(snapshot),
	};
}

/**
 * free-text-parse レスポンスの `note_field` を OnboardingProfile のキーに
 * 変換する。3 つのノートフィールド限定。
 */
export function noteFieldToProfileKey(
	noteField: "lifestyle_note" | "preferences_note" | "snacks_note",
): "lifestyleNote" | "preferencesNote" | "snacksNote" {
	switch (noteField) {
		case "lifestyle_note":
			return "lifestyleNote";
		case "preferences_note":
			return "preferencesNote";
		case "snacks_note":
			return "snacksNote";
	}
}

/**
 * camelCase スナップショットを snake_case キー Record に変換する内部ヘルパ。
 * 未知キーは無視し、`undefined` は落とす。
 */
function camelSnapshotToSnake(
	snapshot: Partial<OnboardingProfile>,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	if (snapshot.name !== undefined) result.name = snapshot.name;
	if (snapshot.age !== undefined) result.age = snapshot.age;
	if (snapshot.sex !== undefined) result.sex = snapshot.sex;
	if (snapshot.heightCm !== undefined) result.height_cm = snapshot.heightCm;
	if (snapshot.weightKg !== undefined) result.weight_kg = snapshot.weightKg;
	if (snapshot.goalWeightKg !== undefined) {
		result.goal_weight_kg = snapshot.goalWeightKg;
	}
	if (snapshot.goalDescription !== undefined) {
		result.goal_description = snapshot.goalDescription;
	}
	if (snapshot.desiredPace !== undefined) {
		result.desired_pace = snapshot.desiredPace;
	}
	if (snapshot.activityLevel !== undefined) {
		result.activity_level = snapshot.activityLevel;
	}
	if (snapshot.jobType !== undefined) result.job_type = snapshot.jobType;
	if (snapshot.workoutsPerWeek !== undefined) {
		result.workouts_per_week = snapshot.workoutsPerWeek;
	}
	if (snapshot.workoutTypes !== undefined) {
		result.workout_types = snapshot.workoutTypes;
	}
	if (snapshot.sleepHours !== undefined)
		result.sleep_hours = snapshot.sleepHours;
	if (snapshot.stressLevel !== undefined)
		result.stress_level = snapshot.stressLevel;
	if (snapshot.alcoholPerWeek !== undefined) {
		result.alcohol_per_week = snapshot.alcoholPerWeek;
	}
	if (snapshot.favoriteMeals !== undefined) {
		result.favorite_meals = snapshot.favoriteMeals;
	}
	if (snapshot.hatedFoods !== undefined)
		result.hated_foods = snapshot.hatedFoods;
	if (snapshot.restrictions !== undefined)
		result.restrictions = snapshot.restrictions;
	if (snapshot.cookingPreference !== undefined) {
		result.cooking_preference = snapshot.cookingPreference;
	}
	if (snapshot.foodAdventurousness !== undefined) {
		result.food_adventurousness = snapshot.foodAdventurousness;
	}
	if (snapshot.currentSnacks !== undefined) {
		result.current_snacks = snapshot.currentSnacks;
	}
	if (snapshot.snackingReason !== undefined) {
		result.snacking_reason = snapshot.snackingReason;
	}
	if (snapshot.snackTastePreference !== undefined) {
		result.snack_taste_preference = snapshot.snackTastePreference;
	}
	if (snapshot.lateNightSnacking !== undefined) {
		result.late_night_snacking = snapshot.lateNightSnacking;
	}
	if (snapshot.eatingOutStyle !== undefined) {
		result.eating_out_style = snapshot.eatingOutStyle;
	}
	if (snapshot.budgetLevel !== undefined)
		result.budget_level = snapshot.budgetLevel;
	if (snapshot.mealFrequencyPreference !== undefined) {
		result.meal_frequency_preference = snapshot.mealFrequencyPreference;
	}
	if (snapshot.locationRegion !== undefined) {
		result.location_region = snapshot.locationRegion;
	}
	if (snapshot.kitchenAccess !== undefined) {
		result.kitchen_access = snapshot.kitchenAccess;
	}
	if (snapshot.convenienceStoreUsage !== undefined) {
		result.convenience_store_usage = snapshot.convenienceStoreUsage;
	}
	if (snapshot.hasMedicalCondition !== undefined) {
		result.has_medical_condition = snapshot.hasMedicalCondition;
	}
	if (snapshot.isUnderTreatment !== undefined) {
		result.is_under_treatment = snapshot.isUnderTreatment;
	}
	if (snapshot.onMedication !== undefined) {
		result.on_medication = snapshot.onMedication;
	}
	if (snapshot.isPregnantOrBreastfeeding !== undefined) {
		result.is_pregnant_or_breastfeeding = snapshot.isPregnantOrBreastfeeding;
	}
	if (snapshot.hasDoctorDietRestriction !== undefined) {
		result.has_doctor_diet_restriction = snapshot.hasDoctorDietRestriction;
	}
	if (snapshot.hasEatingDisorderHistory !== undefined) {
		result.has_eating_disorder_history = snapshot.hasEatingDisorderHistory;
	}
	if (snapshot.medicalConditionNote !== undefined) {
		result.medical_condition_note = snapshot.medicalConditionNote;
	}
	if (snapshot.medicationNote !== undefined) {
		result.medication_note = snapshot.medicationNote;
	}
	if (snapshot.onboardingStage !== undefined) {
		result.onboarding_stage = snapshot.onboardingStage;
	}
	if (snapshot.blockedReason !== undefined) {
		result.blocked_reason = snapshot.blockedReason;
	}
	if (snapshot.preferencesNote !== undefined) {
		result.preferences_note = snapshot.preferencesNote;
	}
	if (snapshot.snacksNote !== undefined)
		result.snacks_note = snapshot.snacksNote;
	if (snapshot.lifestyleNote !== undefined) {
		result.lifestyle_note = snapshot.lifestyleNote;
	}

	return result;
}

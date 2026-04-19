export const PROFILE_FIELDS = [
	// Core body
	"name",
	"age",
	"sex",
	"height_cm",
	"weight_kg",
	"goal_weight_kg",
	"goal_description",
	"desired_pace",
	// Activity / wellness
	"activity_level",
	"job_type",
	"workouts_per_week",
	"workout_types",
	"sleep_hours",
	"stress_level",
	"alcohol_per_week",
	// Food preferences
	"favorite_meals",
	"hated_foods",
	"restrictions",
	"cooking_preference",
	"food_adventurousness",
	// Snacking
	"current_snacks",
	"snacking_reason",
	"snack_taste_preference",
	"late_night_snacking",
	// Feasibility
	"eating_out_style",
	"budget_level",
	"meal_frequency_preference",
	"location_region",
	"kitchen_access",
	"convenience_store_usage",
	// Safety flags
	"has_medical_condition",
	"is_under_treatment",
	"on_medication",
	"is_pregnant_or_breastfeeding",
	"has_doctor_diet_restriction",
	"has_eating_disorder_history",
	"medical_condition_note",
	"medication_note",
	// Onboarding meta
	"onboarding_stage",
	"blocked_reason",
	"preferences_note",
	"snacks_note",
	"lifestyle_note",
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

type Sex = "male" | "female";
type ActivityLevel =
	| "sedentary"
	| "lightly_active"
	| "moderately_active"
	| "very_active"
	| "extremely_active";
type DesiredPace = "steady" | "aggressive";
type StressLevel = "low" | "moderate" | "high";
type JobType =
	| "desk"
	| "standing"
	| "light_physical"
	| "manual_labour"
	| "outdoor";
type CookingPreference = "scratch" | "quick" | "batch" | "mixed";
type SnackingReason = "hunger" | "boredom" | "habit" | "mixed";
type SnackTastePreference = "sweet" | "savory" | "both";
type EatingOutStyle = "mostly_home" | "mostly_eating_out" | "mixed";
type BudgetLevel = "low" | "medium" | "high";
type ConvenienceStoreUsage = "low" | "medium" | "high";
export type OnboardingStage =
	| "safety"
	| "stats"
	| "lifestyle"
	| "preferences"
	| "snacks"
	| "feasibility"
	| "review"
	| "complete"
	| "blocked";

/**
 * Parse 済みのプロフィール更新データ。
 * contracts-ts の生成型に依存せず、Domain 内で完結する独立定義。
 * Parse 後のコードは具体型で安全に進める。
 */
export type ProfilePatch = {
	name?: string;
	age?: number;
	sex?: Sex;
	height_cm?: number;
	weight_kg?: number;
	goal_weight_kg?: number;
	goal_description?: string;
	desired_pace?: DesiredPace;
	activity_level?: ActivityLevel;
	job_type?: JobType;
	workouts_per_week?: number;
	workout_types?: string[];
	sleep_hours?: number;
	stress_level?: StressLevel;
	alcohol_per_week?: string;
	favorite_meals?: string[];
	hated_foods?: string[];
	restrictions?: string[];
	cooking_preference?: CookingPreference;
	food_adventurousness?: number;
	current_snacks?: string[];
	snacking_reason?: SnackingReason;
	snack_taste_preference?: SnackTastePreference;
	late_night_snacking?: boolean;
	eating_out_style?: EatingOutStyle;
	budget_level?: BudgetLevel;
	meal_frequency_preference?: number;
	location_region?: string;
	kitchen_access?: string;
	convenience_store_usage?: ConvenienceStoreUsage;
	has_medical_condition?: boolean;
	is_under_treatment?: boolean;
	on_medication?: boolean;
	is_pregnant_or_breastfeeding?: boolean;
	has_doctor_diet_restriction?: boolean;
	has_eating_disorder_history?: boolean;
	medical_condition_note?: string;
	medication_note?: string;
	onboarding_stage?: OnboardingStage;
	blocked_reason?: string;
	preferences_note?: string;
	snacks_note?: string;
	lifestyle_note?: string;
};

export const PROFILE_FIELDS = [
	"name",
	"age",
	"sex",
	"height_cm",
	"weight_kg",
	"activity_level",
	"desired_pace",
	"sleep_hours",
	"stress_level",
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
	activity_level?: ActivityLevel;
	desired_pace?: DesiredPace;
	sleep_hours?: number;
	stress_level?: StressLevel;
};

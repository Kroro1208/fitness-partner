export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type MealId = Brand<string, "MealId">;
export type FoodId = Brand<string, "FoodId">;
export type IsoDateString = Brand<string, "IsoDateString">;

/**
 * Brand type factory。
 * 空文字列など明らかに不正な値を握りつぶさないよう Parse 検証を行う。
 * null 返しで呼び出し側に失敗を伝え、as cast による無検証昇格を排除する。
 */
export function toUserId(value: string): UserId | null {
	if (value.length === 0) return null;
	return value as UserId;
}

export function toMealId(value: string): MealId | null {
	if (value.length === 0) return null;
	return value as MealId;
}

export function toFoodId(value: string): FoodId | null {
	if (value.length === 0) return null;
	return value as FoodId;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDateString(value: string): IsoDateString | null {
	if (!ISO_DATE_RE.test(value)) return null;
	const d = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return null;
	if (!d.toISOString().startsWith(value)) return null;
	return value as IsoDateString;
}

/**
 * 既に検証済み / 別経路で安全性が保証されている値を Brand に昇格する。
 * 呼び出し前に値の妥当性が示されている場合のみ使用する。
 */
export function unsafeBrand<B extends string>() {
	return <T>(value: T): Brand<T, B> => value as Brand<T, B>;
}

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

export const VALID_MEAL_TYPES = [
	"breakfast",
	"lunch",
	"dinner",
	"snack",
] as const;

export type MealType = (typeof VALID_MEAL_TYPES)[number];

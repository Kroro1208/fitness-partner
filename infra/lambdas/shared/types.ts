import type {
	LogMealInput,
	UpdateUserProfileInput,
} from "../../../packages/contracts-ts/generated/types";

export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type MealId = Brand<string, "MealId">;
export type FoodId = Brand<string, "FoodId">;
export type IsoDateString = Brand<string, "IsoDateString">;

export const toUserId = (value: string): UserId => value as UserId;
export const toMealId = (value: string): MealId => value as MealId;
export const toFoodId = (value: string): FoodId => value as FoodId;
export const toIsoDateString = (value: string): IsoDateString =>
	value as IsoDateString;

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
] as const satisfies readonly (keyof UpdateUserProfileInput)[];

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/**
 * validate 済みのプロフィール更新データ。
 * 生成型 UpdateUserProfileInput から null を除外し、
 * Parse 後のコードが具体型で安全に進めるようにする。
 */
export type ProfilePatch = {
	[K in ProfileField]?: NonNullable<UpdateUserProfileInput[K]>;
};

export const VALID_MEAL_TYPES = [
	"breakfast",
	"lunch",
	"dinner",
	"snack",
] as const satisfies readonly LogMealInput["meal_type"][];

export type MealType = (typeof VALID_MEAL_TYPES)[number];

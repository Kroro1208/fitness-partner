export const VALID_MEAL_TYPES = [
	"breakfast",
	"lunch",
	"dinner",
	"snack",
] as const;

export type MealType = (typeof VALID_MEAL_TYPES)[number];

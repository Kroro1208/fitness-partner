import type { IsoDateString, MealId, UserId } from "../brand";

export function mealKey(userId: UserId, date: IsoDateString, mealId: MealId) {
	return { pk: `user#${userId}`, sk: `meal#${date}#${mealId}` };
}

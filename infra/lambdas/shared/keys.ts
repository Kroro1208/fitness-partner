import type { IsoDateString, MealId, UserId } from "./types";

export function profileKey(userId: UserId) {
  return { pk: `user#${userId}`, sk: "profile" };
}

export function mealKey(userId: UserId, date: IsoDateString, mealId: MealId) {
  return { pk: `user#${userId}`, sk: `meal#${date}#${mealId}` };
}

export function weightKey(userId: UserId, date: IsoDateString) {
  return { pk: `user#${userId}`, sk: `weight#${date}` };
}

export function planKey(userId: UserId, weekStart: IsoDateString) {
  return { pk: `user#${userId}`, sk: `plan#${weekStart}` };
}

import type { IsoDateString, UserId } from "../brand";

export function planKey(userId: UserId, weekStart: IsoDateString) {
	return { pk: `user#${userId}`, sk: `plan#${weekStart}` };
}

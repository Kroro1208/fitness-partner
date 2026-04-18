import type { IsoDateString, UserId } from "../brand";

export function weightKey(userId: UserId, date: IsoDateString) {
	return { pk: `user#${userId}`, sk: `weight#${date}` };
}

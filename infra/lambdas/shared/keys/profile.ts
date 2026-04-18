import type { UserId } from "../brand";

export function profileKey(userId: UserId) {
	return { pk: `user#${userId}`, sk: "profile" };
}

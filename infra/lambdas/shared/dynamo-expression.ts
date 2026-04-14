import type { ProfilePatch } from "./types";

type ExpressionFields = ProfilePatch & { updated_at?: string };

export function buildUpdateExpression(fields: ExpressionFields): {
	UpdateExpression: string;
	ExpressionAttributeNames: Record<string, string>;
	ExpressionAttributeValues: Record<string, unknown>;
} {
	const entries = Object.entries(fields);

	return {
		UpdateExpression: `SET ${entries.map(([key]) => `#${key} = :${key}`).join(", ")}`,
		ExpressionAttributeNames: Object.fromEntries(
			entries.map(([key]) => [`#${key}`, key]),
		),
		ExpressionAttributeValues: Object.fromEntries(
			entries.map(([key, value]) => [`:${key}`, value]),
		),
	};
}

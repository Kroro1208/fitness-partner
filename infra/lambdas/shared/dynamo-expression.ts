import type { ProfilePatch } from "./types";

type ExpressionFields = ProfilePatch & { updated_at?: string };

export function buildUpdateExpression(fields: ExpressionFields): {
	UpdateExpression: string;
	ExpressionAttributeNames: Record<string, string>;
	ExpressionAttributeValues: Record<string, unknown>;
	removeFields: string[];
} {
	const entries = Object.entries(fields).filter(
		([, value]) => value !== undefined && value !== null,
	);

	return {
		UpdateExpression: `SET ${entries.map(([key]) => `#${key} = :${key}`).join(", ")}`,
		ExpressionAttributeNames: Object.fromEntries(
			entries.map(([key]) => [`#${key}`, key]),
		),
		ExpressionAttributeValues: Object.fromEntries(
			entries.map(([key, value]) => [`:${key}`, value]),
		),
		removeFields: [],
	};
}

export function buildProfileUpdateExpression(params: {
	setFields: ExpressionFields;
	removeFields: readonly (keyof ProfilePatch)[];
}): {
	UpdateExpression: string;
	ExpressionAttributeNames: Record<string, string>;
	ExpressionAttributeValues: Record<string, unknown>;
} {
	const setEntries = Object.entries(params.setFields).filter(
		([, value]) => value !== undefined && value !== null,
	);
	const removeEntries = params.removeFields.map(
		(field) => [`#${field}`, field] as const,
	);

	const updateParts: string[] = [];
	if (setEntries.length > 0) {
		updateParts.push(
			`SET ${setEntries.map(([key]) => `#${key} = :${key}`).join(", ")}`,
		);
	}
	if (removeEntries.length > 0) {
		updateParts.push(
			`REMOVE ${removeEntries.map(([name]) => name).join(", ")}`,
		);
	}

	return {
		UpdateExpression: updateParts.join(" "),
		ExpressionAttributeNames: {
			...Object.fromEntries(setEntries.map(([key]) => [`#${key}`, key])),
			...Object.fromEntries(removeEntries),
		},
		ExpressionAttributeValues: Object.fromEntries(
			setEntries.map(([key, value]) => [`:${key}`, value]),
		),
	};
}

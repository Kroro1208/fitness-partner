import type { ProfilePatch } from "./profile-types";

type ExpressionFields = ProfilePatch & { updated_at?: string };

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

import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";

export function isConditionalCheckFailed(error: unknown): boolean {
	return (
		error instanceof ConditionalCheckFailedException ||
		(error instanceof Error && error.name === "ConditionalCheckFailedException")
	);
}

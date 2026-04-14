import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { buildUpdateExpression } from "../shared/dynamo-expression";
import { profileKey } from "../shared/keys";
import {
	badRequest,
	ok,
	requireJsonBody,
	serverError,
	withServerError,
} from "../shared/response";
import { validateUpdateProfileInput } from "../shared/validate-profile";

export async function handler(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const auth = requireUserId(event);
	if (!auth.ok) return auth.response;

	const parsed = requireJsonBody(event);
	if (!parsed.ok) return parsed.response;

	const now = new Date().toISOString();

	const validation = validateUpdateProfileInput(parsed.body);
	if (!validation.valid) {
		return badRequest(validation.message);
	}

	const expr = buildUpdateExpression({ ...validation.data, updated_at: now });

	return withServerError("updateUserProfile", async () => {
		const { Attributes } = await docClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: profileKey(auth.userId),
				UpdateExpression: expr.UpdateExpression,
				ExpressionAttributeNames: expr.ExpressionAttributeNames,
				ExpressionAttributeValues: expr.ExpressionAttributeValues,
				ReturnValues: "ALL_NEW",
			}),
		);

		if (!Attributes) {
			return serverError();
		}

		return ok({ profile: stripKeys(Attributes) });
	});
}

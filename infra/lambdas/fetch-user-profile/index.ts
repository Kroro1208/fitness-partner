import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { profileKey } from "../shared/keys";
import { notFound, ok, withServerError } from "../shared/response";

export async function handler(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const auth = requireUserId(event);
	if (!auth.ok) return auth.response;

	return withServerError("fetchUserProfile", async () => {
		const { Item } = await docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: profileKey(auth.userId),
			}),
		);

		if (!Item) {
			return notFound();
		}

		return ok({ profile: stripKeys(Item) });
	});
}

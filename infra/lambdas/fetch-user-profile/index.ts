import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { ProfileRowSchema } from "../shared/db-schemas";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { profileKey } from "../shared/keys/profile";
import { notFound, ok, serverError, withServerError } from "../shared/response";

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

		// Untrusted DB row を schema parse し、以降のコードを trusted model で進める。
		const stripped = stripKeys(Item);
		const result = ProfileRowSchema.safeParse(stripped);
		if (!result.success) {
			console.error("fetchUserProfile: profile row parse failed", {
				issues: result.error.issues,
			});
			return serverError();
		}

		return ok({ profile: result.data });
	});
}

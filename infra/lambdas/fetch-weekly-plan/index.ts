import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { planKey } from "../shared/keys";
import { badRequest, notFound, ok, withServerError } from "../shared/response";
import { isValidDate } from "../shared/validation";

export async function handler(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const auth = requireUserId(event);
	if (!auth.ok) return auth.response;

	const weekStart: string | undefined = event.pathParameters?.weekStart;
	if (!isValidDate(weekStart)) {
		return badRequest("weekStart must be a valid YYYY-MM-DD date");
	}

	return withServerError("fetchWeeklyPlan", async () => {
		const { Item } = await docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: planKey(auth.userId, weekStart),
			}),
		);

		if (!Item) {
			return notFound();
		}

		return ok({ plan: stripKeys(Item) });
	});
}

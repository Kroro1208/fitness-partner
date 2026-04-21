import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { toIsoDateString } from "../shared/brand";
import { WeeklyPlanRowSchema } from "../shared/db-schemas";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { planKey } from "../shared/keys/plan";
import {
	badRequest,
	notFound,
	ok,
	serverError,
	withServerError,
} from "../shared/response";

export async function handler(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyStructuredResultV2> {
	const auth = requireUserId(event);
	if (!auth.ok) return auth.response;

	const rawWeekStart = event.pathParameters?.weekStart;
	if (typeof rawWeekStart !== "string") {
		return badRequest("weekStart path parameter is required");
	}
	const weekStart = toIsoDateString(rawWeekStart);
	if (!weekStart) {
		return badRequest("weekStart must be a valid YYYY-MM-DD date");
	}

	return withServerError("fetchWeeklyPlan", async () => {
		const { Item } = await docClient.send(
			new GetCommand({
				TableName: TABLE_NAME,
				Key: planKey(auth.userId, weekStart),
				ConsistentRead: true,
			}),
		);

		if (!Item) {
			return notFound();
		}

		const stripped = stripKeys(Item);
		const result = WeeklyPlanRowSchema.safeParse(stripped);
		if (!result.success) {
			console.error("fetchWeeklyPlan: plan row parse failed", {
				issues: result.error.issues,
			});
			return serverError();
		}

		return ok({ plan: result.data });
	});
}

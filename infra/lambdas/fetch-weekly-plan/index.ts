import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { planKey } from "../shared/keys";
import {
  ok,
  badRequest,
  notFound,
  withServerError,
} from "../shared/response";
import { isValidDate } from "../shared/validation";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
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

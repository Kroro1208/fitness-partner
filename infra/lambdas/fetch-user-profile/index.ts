import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { profileKey } from "../shared/keys";
import { ok, notFound, withServerError } from "../shared/response";

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
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

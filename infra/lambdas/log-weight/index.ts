import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { LogWeightInput } from "../../../packages/contracts-ts/generated/types";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { weightKey } from "../shared/keys";
import {
  ok,
  badRequest,
  requireJsonBody,
  withServerError,
} from "../shared/response";
import { isRecord, isValidDate, isInRange } from "../shared/validation";
import type { IsoDateString } from "../shared/types";

type ValidatedLogWeightInput = {
  date: IsoDateString;
  weight_kg: LogWeightInput["weight_kg"];
};

function validateLogWeightInput(
  body: unknown,
):
  | { valid: true; data: ValidatedLogWeightInput }
  | { valid: false; message: string } {
  if (!isRecord(body)) {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  const { date, weight_kg } = body;

  if (!isValidDate(date)) {
    return { valid: false, message: "date must be a valid YYYY-MM-DD date" };
  }
  if (!isInRange(weight_kg, { gt: 0, lt: 500 })) {
    return { valid: false, message: "weight_kg must be > 0 and < 500" };
  }

  return { valid: true, data: { date, weight_kg } };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const parsed = requireJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const validation = validateLogWeightInput(parsed.body);
  if (!validation.valid) {
    return badRequest(validation.message);
  }

  const loggedAt = new Date().toISOString();

  const item = {
    ...weightKey(auth.userId, validation.data.date),
    date: validation.data.date,
    weight_kg: validation.data.weight_kg,
    logged_at: loggedAt,
  };

  return withServerError("logWeight", async () => {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    const weight = stripKeys(item);
    return ok({ weight });
  });
}

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import type { LogMealInput } from "../../../packages/contracts-ts/generated/types";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { requireUserId } from "../shared/auth";
import { docClient, TABLE_NAME, stripKeys } from "../shared/dynamo";
import { mealKey } from "../shared/keys";
import {
  ok,
  badRequest,
  requireJsonBody,
  withServerError,
} from "../shared/response";
import {
  isRecord,
  isValidDate,
  isValidEnum,
  isInRange,
  isValidFoodId,
} from "../shared/validation";
import {
  VALID_MEAL_TYPES,
  toMealId,
  type FoodId,
  type IsoDateString,
  type MealId,
  type MealType,
} from "../shared/types";

const VALID_MEAL_TYPE: ReadonlySet<MealType> = new Set(VALID_MEAL_TYPES);

type ValidatedLogMealInput = {
  date: IsoDateString;
  food_id: FoodId;
  amount_g: LogMealInput["amount_g"];
  meal_type: MealType;
};

function validateLogMealInput(
  body: unknown,
):
  | { valid: true; data: ValidatedLogMealInput }
  | { valid: false; message: string } {
  if (!isRecord(body)) {
    return { valid: false, message: "Request body must be a JSON object" };
  }

  const { date, food_id, amount_g, meal_type } = body;

  if (!isValidDate(date)) {
    return { valid: false, message: "date must be a valid YYYY-MM-DD date" };
  }
  if (!isValidFoodId(food_id)) {
    return { valid: false, message: "food_id must be a non-empty string" };
  }
  if (!isInRange(amount_g, { gt: 0 })) {
    return { valid: false, message: "amount_g must be > 0" };
  }
  if (!isValidEnum(meal_type, VALID_MEAL_TYPE)) {
    return {
      valid: false,
      message: "meal_type must be breakfast, lunch, dinner, or snack",
    };
  }

  return { valid: true, data: { date, food_id, amount_g, meal_type } };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const auth = requireUserId(event);
  if (!auth.ok) return auth.response;

  const parsed = requireJsonBody(event);
  if (!parsed.ok) return parsed.response;

  const validation = validateLogMealInput(parsed.body);
  if (!validation.valid) {
    return badRequest(validation.message);
  }

  const mealId: MealId = toMealId(crypto.randomUUID());
  const loggedAt = new Date().toISOString();

  const item = {
    ...mealKey(auth.userId, validation.data.date, mealId),
    meal_id: mealId,
    date: validation.data.date,
    food_id: validation.data.food_id,
    amount_g: validation.data.amount_g,
    meal_type: validation.data.meal_type,
    logged_at: loggedAt,
  };

  return withServerError("logMeal", async () => {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    return ok({ meal: stripKeys(item) });
  });
}

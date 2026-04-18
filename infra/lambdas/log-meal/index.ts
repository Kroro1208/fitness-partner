import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { LogMealInputSchema } from "@fitness/contracts-ts";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { unsafeBrand } from "../shared/brand";
import { type Clock, systemClock } from "../shared/clock";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { type IdGenerator, systemIdGenerator } from "../shared/ids";
import { mealKey } from "../shared/keys/meal";
import { parseRequest } from "../shared/parse";
import { ok, requireJsonBody, withServerError } from "../shared/response";

const brandFoodId = unsafeBrand<"FoodId">();
const brandIsoDate = unsafeBrand<"IsoDateString">();
const brandMealId = unsafeBrand<"MealId">();

export function createHandler(deps: { clock: Clock; ids: IdGenerator }) {
	return async (
		event: APIGatewayProxyEventV2WithJWTAuthorizer,
	): Promise<APIGatewayProxyStructuredResultV2> => {
		// ── Input ──────────────────────────────────────────────
		const auth = requireUserId(event);
		if (!auth.ok) return auth.response;

		const body = requireJsonBody(event);
		if (!body.ok) return body.response;

		const parsed = parseRequest(LogMealInputSchema, body.body);
		if (!parsed.ok) return parsed.response;

		const mealId = brandMealId(deps.ids.mealId());
		const loggedAt = deps.clock.now().toISOString();

		// ── Process ────────────────────────────────────────────
		// Zod schema が shape を保証済み。Brand 昇格は unsafe で十分。
		const date = brandIsoDate(parsed.data.date);
		const foodId = brandFoodId(parsed.data.food_id);

		const item = {
			...mealKey(auth.userId, date, mealId),
			meal_id: mealId,
			date,
			food_id: foodId,
			amount_g: parsed.data.amount_g,
			meal_type: parsed.data.meal_type,
			logged_at: loggedAt,
		};

		// ── Output ─────────────────────────────────────────────
		return withServerError("logMeal", async () => {
			await docClient.send(
				new PutCommand({ TableName: TABLE_NAME, Item: item }),
			);
			return ok({ meal: stripKeys(item) });
		});
	};
}

export const handler = createHandler({
	clock: systemClock,
	ids: systemIdGenerator,
});

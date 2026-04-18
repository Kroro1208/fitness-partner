import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { LogWeightInputSchema } from "@fitness/contracts-ts";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { unsafeBrand } from "../shared/brand";
import { type Clock, systemClock } from "../shared/clock";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { weightKey } from "../shared/keys/weight";
import { parseRequest } from "../shared/parse";
import { ok, requireJsonBody, withServerError } from "../shared/response";

const brandIsoDate = unsafeBrand<"IsoDateString">();

export function createHandler(deps: { clock: Clock }) {
	return async (
		event: APIGatewayProxyEventV2WithJWTAuthorizer,
	): Promise<APIGatewayProxyStructuredResultV2> => {
		// ── Input ──────────────────────────────────────────────
		const auth = requireUserId(event);
		if (!auth.ok) return auth.response;

		const body = requireJsonBody(event);
		if (!body.ok) return body.response;

		const parsed = parseRequest(LogWeightInputSchema, body.body);
		if (!parsed.ok) return parsed.response;

		const loggedAt = deps.clock.now().toISOString();

		// ── Process ────────────────────────────────────────────
		const date = brandIsoDate(parsed.data.date);
		const item = {
			...weightKey(auth.userId, date),
			date,
			weight_kg: parsed.data.weight_kg,
			logged_at: loggedAt,
		};

		// ── Output ─────────────────────────────────────────────
		return withServerError("logWeight", async () => {
			await docClient.send(
				new PutCommand({ TableName: TABLE_NAME, Item: item }),
			);
			return ok({ weight: stripKeys(item) });
		});
	};
}

export const handler = createHandler({ clock: systemClock });

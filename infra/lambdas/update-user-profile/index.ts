import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
	type UpdateUserProfileInput,
	UpdateUserProfileInputSchema,
} from "@fitness/contracts-ts";
import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { requireUserId } from "../shared/auth";
import { type Clock, systemClock } from "../shared/clock";
import { ProfileRowSchema } from "../shared/db-schemas";
import { docClient, stripKeys, TABLE_NAME } from "../shared/dynamo";
import { buildProfileUpdateExpression } from "../shared/dynamo-expression";
import { profileKey } from "../shared/keys/profile";
import { parseRequest } from "../shared/parse";
import {
	PROFILE_FIELDS,
	type ProfileField,
	type ProfilePatch,
} from "../shared/profile-types";
import {
	badRequest,
	ok,
	requireJsonBody,
	serverError,
	withServerError,
} from "../shared/response";

/**
 * UpdateUserProfileInput (null 許容 optional) を Dynamo 更新用の
 * set/remove に分解する。null は「属性をクリアする PATCH 意図」と解釈し、
 * REMOVE 句に落とす。
 */
function assignProfileField<K extends ProfileField>(
	target: ProfilePatch,
	field: K,
	value: ProfilePatch[K],
) {
	target[field] = value;
}

function toProfileMutation(input: UpdateUserProfileInput): {
	setFields: ProfilePatch;
	removeFields: ProfileField[];
} {
	const setFields: ProfilePatch = {};
	const removeFields: ProfileField[] = [];

	for (const field of PROFILE_FIELDS) {
		const value = input[field];
		if (value === null) {
			removeFields.push(field);
			continue;
		}
		if (value === undefined) continue;
		assignProfileField(setFields, field, value);
	}

	return { setFields, removeFields };
}

export function createHandler(deps: { clock: Clock }) {
	return async (
		event: APIGatewayProxyEventV2WithJWTAuthorizer,
	): Promise<APIGatewayProxyStructuredResultV2> => {
		// ── Input ──────────────────────────────────────────────
		const auth = requireUserId(event);
		if (!auth.ok) return auth.response;

		const body = requireJsonBody(event);
		if (!body.ok) return body.response;

		const parsed = parseRequest(UpdateUserProfileInputSchema, body.body);
		if (!parsed.ok) return parsed.response;

		const now = deps.clock.now().toISOString();

		// ── Process ────────────────────────────────────────────
		const mutation = toProfileMutation(parsed.data);
		if (
			Object.keys(mutation.setFields).length === 0 &&
			mutation.removeFields.length === 0
		) {
			return badRequest("At least one field must be provided");
		}
		const expr = buildProfileUpdateExpression({
			setFields: { ...mutation.setFields, updated_at: now },
			removeFields: mutation.removeFields,
		});

		// ── Output ─────────────────────────────────────────────
		return withServerError("updateUserProfile", async () => {
			const { Attributes } = await docClient.send(
				new UpdateCommand({
					TableName: TABLE_NAME,
					Key: profileKey(auth.userId),
					UpdateExpression: expr.UpdateExpression,
					ExpressionAttributeNames: expr.ExpressionAttributeNames,
					ExpressionAttributeValues: expr.ExpressionAttributeValues,
					ReturnValues: "ALL_NEW",
				}),
			);

			if (!Attributes) {
				return serverError();
			}

			// Untrusted DB row を schema parse し、fetch-user-profile と一貫した
			// Output 境界を維持する。DB 側で想定外フィールドが混入したら 500 で fail-fast。
			const stripped = stripKeys(Attributes);
			const result = ProfileRowSchema.safeParse(stripped);
			if (!result.success) {
				console.error("updateUserProfile: profile row parse failed", {
					issues: result.error.issues,
				});
				return serverError();
			}

			return ok({ profile: result.data });
		});
	};
}

export const handler = createHandler({ clock: systemClock });

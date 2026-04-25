import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { isConditionalCheckFailed } from "./aws-errors";
import { docClient, TABLE_NAME } from "./dynamo";

export type RateLimitRule = {
	name: string;
	limit: number;
	windowSeconds: number;
};

export type RateLimitResult =
	| { allowed: true }
	| { allowed: false; retryAfterSeconds: number };

function windowStartEpochSeconds(
	nowEpochSeconds: number,
	windowSeconds: number,
): number {
	return Math.floor(nowEpochSeconds / windowSeconds) * windowSeconds;
}

function rateLimitKey(params: {
	userId: string;
	ruleName: string;
	windowStart: number;
}) {
	return {
		pk: `user#${params.userId}`,
		sk: `rate#${params.ruleName}#${params.windowStart}`,
	};
}

export async function consumeUserRateLimit(params: {
	userId: string;
	rule: RateLimitRule;
	nowEpochSeconds: number;
}): Promise<RateLimitResult> {
	const windowStart = windowStartEpochSeconds(
		params.nowEpochSeconds,
		params.rule.windowSeconds,
	);
	const retryAfterSeconds =
		windowStart + params.rule.windowSeconds - params.nowEpochSeconds;

	try {
		await docClient.send(
			new UpdateCommand({
				TableName: TABLE_NAME,
				Key: rateLimitKey({
					userId: params.userId,
					ruleName: params.rule.name,
					windowStart,
				}),
				UpdateExpression:
					"SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl",
				ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
				ExpressionAttributeNames: {
					"#count": "count",
					"#ttl": "ttl",
				},
				ExpressionAttributeValues: {
					":zero": 0,
					":one": 1,
					":limit": params.rule.limit,
					":ttl": windowStart + params.rule.windowSeconds + 60,
				},
			}),
		);
		return { allowed: true };
	} catch (error) {
		if (isConditionalCheckFailed(error)) {
			return {
				allowed: false,
				retryAfterSeconds: Math.max(1, retryAfterSeconds),
			};
		}
		throw error;
	}
}

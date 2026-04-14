import { createHash } from "node:crypto";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { PreSignUpTriggerEvent } from "aws-lambda";
import { docClient, TABLE_NAME } from "../shared/dynamo";

const ssmClient = new SSMClient({});
const MIN_INVITE_TOKEN_LENGTH = 24;
let inviteTokensPromise: Promise<ReadonlySet<string>> | undefined;

function getInviteCodesParameterName(): string {
	const parameterName = process.env.INVITE_CODES_PARAMETER_NAME;
	if (!parameterName) {
		throw new Error(
			"INVITE_CODES_PARAMETER_NAME environment variable is required",
		);
	}
	return parameterName;
}

export function resetInviteTokenCache(): void {
	inviteTokensPromise = undefined;
}

export function parseInviteTokens(parameterValue: string): ReadonlySet<string> {
	const tokens = new Set(
		parameterValue
			.split(/[\n,]/u)
			.map((token) => token.trim())
			.filter((token) => token.length > 0),
	);
	if (tokens.size === 0) {
		throw new Error("Invite token parameter must contain at least one token.");
	}
	for (const token of tokens) {
		if (token.length < MIN_INVITE_TOKEN_LENGTH) {
			throw new Error(
				`Invite token "${token}" is too short. Use high-entropy tokens with length >= ${MIN_INVITE_TOKEN_LENGTH}.`,
			);
		}
	}
	return tokens;
}

export async function getAllowedInviteTokens(): Promise<ReadonlySet<string>> {
	if (!inviteTokensPromise) {
		inviteTokensPromise = (async () => {
			const response = await ssmClient.send(
				new GetParameterCommand({
					Name: getInviteCodesParameterName(),
					WithDecryption: true,
				}),
			);
			const parameterValue = response.Parameter?.Value;
			if (!parameterValue) {
				throw new Error("Invite token parameter is empty.");
			}
			return parseInviteTokens(parameterValue);
		})();
	}

	try {
		return await inviteTokensPromise;
	} catch (error) {
		inviteTokensPromise = undefined;
		throw error;
	}
}

function hashInviteToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

function isConditionalCheckFailed(error: unknown): boolean {
	return (
		error instanceof Error && error.name === "ConditionalCheckFailedException"
	);
}

export async function redeemInviteToken(
	token: string,
	redeemedBy: string,
): Promise<boolean> {
	const tokenHash = hashInviteToken(token);
	try {
		await docClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: {
					pk: `INVITE#${tokenHash}`,
					sk: "REDEMPTION",
					invite_token_hash: tokenHash,
					redeemed_by: redeemedBy,
					redeemed_at: new Date().toISOString(),
				},
				ConditionExpression: "attribute_not_exists(pk)",
			}),
		);
		return true;
	} catch (error) {
		if (isConditionalCheckFailed(error)) {
			return false;
		}
		throw error;
	}
}

export const handler = async (
	event: PreSignUpTriggerEvent,
): Promise<PreSignUpTriggerEvent> => {
	const providedCode = event.request.clientMetadata?.inviteCode;
	if (!providedCode || providedCode.length < MIN_INVITE_TOKEN_LENGTH) {
		throw new Error("Invalid or missing invite code.");
	}

	const allowedInviteTokens = await getAllowedInviteTokens();
	if (!allowedInviteTokens.has(providedCode)) {
		throw new Error("Invalid or missing invite code.");
	}

	const redeemed = await redeemInviteToken(providedCode, event.userName);
	if (!redeemed) {
		throw new Error("Invite code has already been used.");
	}

	// 自動確認はしない (メール検証を Cognito に任せる)
	return event;
};

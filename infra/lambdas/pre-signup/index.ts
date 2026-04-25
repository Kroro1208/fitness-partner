import { createHash } from "node:crypto";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import type { PreSignUpTriggerEvent } from "aws-lambda";
import { z } from "zod";
import { isConditionalCheckFailed } from "../shared/aws-errors";
import { type Clock, systemClock } from "../shared/clock";
import { docClient, TABLE_NAME } from "../shared/dynamo";

const ssmClient = new SSMClient({});
const MIN_INVITE_TOKEN_LENGTH = 24;

/**
 * Cognito clientMetadata は untrusted。schema で形式検証する。
 */
const InviteCodeSchema = z
	.string()
	.min(MIN_INVITE_TOKEN_LENGTH, {
		message: "Invite code is too short",
	})
	.regex(/^[A-Za-z0-9_-]+$/u, {
		message: "Invite code must contain only URL-safe characters",
	});

let inviteTokensPromise: Promise<ReadonlySet<string>> | undefined;

// ── Input helpers ──────────────────────────────────────────────

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

// ── Process (pure) ─────────────────────────────────────────────

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

function hashInviteToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

type RedemptionItem = {
	pk: string;
	sk: "REDEMPTION";
	invite_token_hash: string;
	redeemed_by: string;
	redeemed_at: string;
};

export function buildRedemptionItem(
	tokenHash: string,
	redeemedBy: string,
	redeemedAt: string,
): RedemptionItem {
	return {
		pk: `INVITE#${tokenHash}`,
		sk: "REDEMPTION",
		invite_token_hash: tokenHash,
		redeemed_by: redeemedBy,
		redeemed_at: redeemedAt,
	};
}

// ── Output ─────────────────────────────────────────────────────

type RedemptionResult = "ok" | "already_redeemed";

async function putRedemption(item: RedemptionItem): Promise<RedemptionResult> {
	try {
		await docClient.send(
			new PutCommand({
				TableName: TABLE_NAME,
				Item: item,
				ConditionExpression: "attribute_not_exists(pk)",
			}),
		);
		return "ok";
	} catch (error) {
		if (isConditionalCheckFailed(error)) {
			return "already_redeemed";
		}
		throw error;
	}
}

// ── Handler (I → P → O) ────────────────────────────────────────

export function createHandler(deps: { clock: Clock }) {
	return async (
		event: PreSignUpTriggerEvent,
	): Promise<PreSignUpTriggerEvent> => {
		// ── Input ──────────────────────────────────────────────
		const parsed = InviteCodeSchema.safeParse(
			event.request.clientMetadata?.inviteCode,
		);
		if (!parsed.success) {
			throw new Error("Invalid or missing invite code.");
		}
		const providedCode = parsed.data;

		const allowedInviteTokens = await getAllowedInviteTokens();
		const redeemedAt = deps.clock.now().toISOString();

		// ── Process ────────────────────────────────────────────
		if (!allowedInviteTokens.has(providedCode)) {
			throw new Error("Invalid or missing invite code.");
		}
		const item = buildRedemptionItem(
			hashInviteToken(providedCode),
			event.userName,
			redeemedAt,
		);

		// ── Output ─────────────────────────────────────────────
		const result = await putRedemption(item);
		if (result === "already_redeemed") {
			throw new Error("Invite code has already been used.");
		}

		// 自動確認はしない (メール検証を Cognito に任せる)
		return event;
	};
}

export const handler = createHandler({ clock: systemClock });

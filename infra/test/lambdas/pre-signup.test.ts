import {
	GetParameterCommand,
	type GetParameterCommandOutput,
	SSMClient,
} from "@aws-sdk/client-ssm";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import type { PreSignUpTriggerEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
	getAllowedInviteTokens,
	handler,
	parseInviteTokens,
	resetInviteTokenCache,
} from "../../lambdas/pre-signup/index";

const ssmMock = mockClient(SSMClient);
const ddbMock = mockClient(DynamoDBDocumentClient);

const VALID_TOKEN_A = "5f4f8d3a2c1b0e9d8c7b6a5f";
const VALID_TOKEN_B = "3bb4f1f09d4c4b6db8f2a3d0";

function makeParameterValueResponse(value: string): GetParameterCommandOutput {
	return {
		$metadata: {},
		Parameter: {
			Value: value,
		},
	};
}

function makeEvent(inviteCode?: string): PreSignUpTriggerEvent {
	return {
		version: "1",
		region: "ap-northeast-1",
		userPoolId: "ap-northeast-1_test",
		userName: "invitee@example.com",
		triggerSource: "PreSignUp_SignUp",
		callerContext: {
			awsSdkVersion: "test",
			clientId: "client-id",
		},
		request: {
			userAttributes: {
				email: "invitee@example.com",
			},
			validationData: undefined,
			clientMetadata: inviteCode ? { inviteCode } : undefined,
		},
		response: {
			autoConfirmUser: false,
			autoVerifyEmail: false,
			autoVerifyPhone: false,
		},
	};
}

beforeEach(() => {
	process.env.INVITE_CODES_PARAMETER_NAME = "/fitness/test/invite-codes";
	ssmMock.reset();
	ddbMock.reset();
	resetInviteTokenCache();
});

describe("parseInviteTokens", () => {
	it("parses newline and comma separated tokens", () => {
		expect(
			parseInviteTokens(`${VALID_TOKEN_A}\n${VALID_TOKEN_B},${VALID_TOKEN_A}`),
		).toEqual(new Set([VALID_TOKEN_A, VALID_TOKEN_B]));
	});

	it("rejects short tokens", () => {
		expect(() => parseInviteTokens("short-token")).toThrow("Invite token");
	});
});

describe("getAllowedInviteTokens", () => {
	it("loads and caches decrypted SecureString value", async () => {
		ssmMock
			.on(GetParameterCommand)
			.resolves(
				makeParameterValueResponse(`${VALID_TOKEN_A},${VALID_TOKEN_B}`),
			);

		const first = await getAllowedInviteTokens();
		const second = await getAllowedInviteTokens();

		expect(first).toEqual(new Set([VALID_TOKEN_A, VALID_TOKEN_B]));
		expect(second).toEqual(first);
		expect(ssmMock.commandCalls(GetParameterCommand)).toHaveLength(1);
	});
});

describe("pre-signup handler", () => {
	it("accepts valid unused invite token", async () => {
		ssmMock
			.on(GetParameterCommand)
			.resolves(
				makeParameterValueResponse(`${VALID_TOKEN_A},${VALID_TOKEN_B}`),
			);
		ddbMock.on(PutCommand).resolves({});

		const event = makeEvent(VALID_TOKEN_A);
		await expect(handler(event)).resolves.toBe(event);
		expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
	});

	it("rejects missing invite token", async () => {
		await expect(handler(makeEvent())).rejects.toThrow(
			"Invalid or missing invite code.",
		);
	});

	it("rejects token not present in SecureString parameter", async () => {
		ssmMock
			.on(GetParameterCommand)
			.resolves(
				makeParameterValueResponse(`${VALID_TOKEN_A},${VALID_TOKEN_B}`),
			);

		await expect(
			handler(makeEvent("aaaaaaaaaaaaaaaaaaaaaaaa")),
		).rejects.toThrow("Invalid or missing invite code.");
	});

	it("rejects invite token reuse", async () => {
		ssmMock
			.on(GetParameterCommand)
			.resolves(
				makeParameterValueResponse(`${VALID_TOKEN_A},${VALID_TOKEN_B}`),
			);
		ddbMock.on(PutCommand).rejects(
			Object.assign(new Error("already used"), {
				name: "ConditionalCheckFailedException",
			}),
		);

		await expect(handler(makeEvent(VALID_TOKEN_A))).rejects.toThrow(
			"Invite code has already been used.",
		);
	});
});

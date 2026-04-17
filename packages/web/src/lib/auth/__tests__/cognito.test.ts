import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();

vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
	class CognitoIdentityProviderClient {
		send = sendMock;
	}

	class SignUpCommand {
		constructor(public readonly input: unknown) {}
	}

	class ConfirmSignUpCommand {
		constructor(public readonly input: unknown) {}
	}

	class InitiateAuthCommand {
		constructor(public readonly input: unknown) {}
	}

	return {
		CognitoIdentityProviderClient,
		SignUpCommand,
		ConfirmSignUpCommand,
		InitiateAuthCommand,
	};
});

import { cognitoSignUp } from "../cognito";

describe("cognitoSignUp", () => {
	beforeEach(() => {
		sendMock.mockReset();
		process.env.COGNITO_USER_POOL_ID = "ap-northeast-1_test";
		process.env.COGNITO_CLIENT_ID = "client-id";
		process.env.COGNITO_REGION = "ap-northeast-1";
	});

	it("passes inviteCode via ClientMetadata for pre-signup Lambda", async () => {
		sendMock.mockResolvedValueOnce({ UserSub: "user-sub-1" });

		await cognitoSignUp("invitee@example.com", "password123", "invite-token");

		expect(sendMock).toHaveBeenCalledTimes(1);
		const command = sendMock.mock.calls[0][0] as {
			input: {
				ClientMetadata?: Record<string, string>;
				UserAttributes?: Array<{ Name: string; Value: string }>;
			};
		};
		expect(command.input.ClientMetadata).toEqual({
			inviteCode: "invite-token",
		});
		expect(command.input.UserAttributes).toEqual([
			{ Name: "email", Value: "invitee@example.com" },
		]);
	});
});

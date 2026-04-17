import "server-only";

import {
	CognitoIdentityProviderClient,
	ConfirmSignUpCommand,
	InitiateAuthCommand,
	SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { z } from "zod";

const envSchema = z.object({
	COGNITO_USER_POOL_ID: z.string().min(1),
	COGNITO_CLIENT_ID: z.string().min(1),
	COGNITO_REGION: z.string().min(1).default("ap-northeast-1"),
});

function getEnv() {
	return envSchema.parse({
		COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
		COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
		COGNITO_REGION: process.env.COGNITO_REGION,
	});
}

let clientCache: CognitoIdentityProviderClient | null = null;
function getClient(): CognitoIdentityProviderClient {
	if (!clientCache) {
		const env = getEnv();
		clientCache = new CognitoIdentityProviderClient({
			region: env.COGNITO_REGION,
		});
	}
	return clientCache;
}

const signUpInput = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	inviteCode: z.string().min(1),
});

export async function cognitoSignUp(
	email: string,
	password: string,
	inviteCode: string,
): Promise<{ userSub: string | undefined }> {
	const parsed = signUpInput.parse({ email, password, inviteCode });
	const env = getEnv();
	const res = await getClient().send(
		new SignUpCommand({
			ClientId: env.COGNITO_CLIENT_ID,
			Username: parsed.email,
			Password: parsed.password,
			UserAttributes: [{ Name: "email", Value: parsed.email }],
			ClientMetadata: {
				inviteCode: parsed.inviteCode,
			},
		}),
	);
	return { userSub: res.UserSub };
}

const confirmInput = z.object({
	email: z.string().email(),
	code: z.string().min(1),
});

export async function cognitoConfirmSignUp(
	email: string,
	code: string,
): Promise<void> {
	const parsed = confirmInput.parse({ email, code });
	const env = getEnv();
	await getClient().send(
		new ConfirmSignUpCommand({
			ClientId: env.COGNITO_CLIENT_ID,
			Username: parsed.email,
			ConfirmationCode: parsed.code,
		}),
	);
}

export type CognitoTokens = {
	idToken: string;
	accessToken: string;
	refreshToken: string;
	expiresIn: number;
};

const signInInput = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export async function cognitoSignIn(
	email: string,
	password: string,
): Promise<CognitoTokens> {
	const parsed = signInInput.parse({ email, password });
	const env = getEnv();
	const res = await getClient().send(
		new InitiateAuthCommand({
			ClientId: env.COGNITO_CLIENT_ID,
			AuthFlow: "USER_PASSWORD_AUTH",
			AuthParameters: {
				USERNAME: parsed.email,
				PASSWORD: parsed.password,
			},
		}),
	);
	const tokens = res.AuthenticationResult;
	if (!tokens?.IdToken || !tokens.AccessToken || !tokens.RefreshToken) {
		throw new Error("Cognito did not return a complete token set");
	}
	return {
		idToken: tokens.IdToken,
		accessToken: tokens.AccessToken,
		refreshToken: tokens.RefreshToken,
		expiresIn: tokens.ExpiresIn ?? 3600,
	};
}

const refreshInput = z.object({
	refreshToken: z.string().min(1),
});

export async function cognitoRefreshTokens(
	refreshToken: string,
): Promise<Omit<CognitoTokens, "refreshToken">> {
	const parsed = refreshInput.parse({ refreshToken });
	const env = getEnv();
	const res = await getClient().send(
		new InitiateAuthCommand({
			ClientId: env.COGNITO_CLIENT_ID,
			AuthFlow: "REFRESH_TOKEN_AUTH",
			AuthParameters: {
				REFRESH_TOKEN: parsed.refreshToken,
			},
		}),
	);
	const tokens = res.AuthenticationResult;
	if (!tokens?.IdToken || !tokens.AccessToken) {
		throw new Error("Cognito did not return refreshed tokens");
	}
	return {
		idToken: tokens.IdToken,
		accessToken: tokens.AccessToken,
		expiresIn: tokens.ExpiresIn ?? 3600,
	};
}

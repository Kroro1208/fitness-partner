import "server-only";

import { cookies } from "next/headers";

import { type CognitoTokens, cognitoRefreshTokens } from "./cognito";
import { decodeSessionFromIdToken } from "./jwt";

export const COOKIE_ID = "__fitness_id";
export const COOKIE_ACCESS = "__fitness_access";
export const COOKIE_REFRESH = "__fitness_refresh";

const ONE_HOUR = 60 * 60;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

type CookieBaseOptions = {
	httpOnly: true;
	sameSite: "lax";
	secure: boolean;
	path: "/";
};

function baseCookieOptions() {
	return {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
	} as const satisfies CookieBaseOptions;
}

export async function setSession(tokens: CognitoTokens): Promise<void> {
	const store = await cookies();
	const common = baseCookieOptions();
	store.set(COOKIE_ID, tokens.idToken, { ...common, maxAge: ONE_HOUR });
	store.set(COOKIE_ACCESS, tokens.accessToken, { ...common, maxAge: ONE_HOUR });
	store.set(COOKIE_REFRESH, tokens.refreshToken, {
		...common,
		maxAge: THIRTY_DAYS,
	});
}

export async function setRefreshedTokens(
	idToken: string,
	accessToken: string,
): Promise<void> {
	const store = await cookies();
	const common = baseCookieOptions();
	store.set(COOKIE_ID, idToken, { ...common, maxAge: ONE_HOUR });
	store.set(COOKIE_ACCESS, accessToken, { ...common, maxAge: ONE_HOUR });
}

export type SessionUser = {
	userId: string;
	email: string;
};

export async function getSession(): Promise<SessionUser | null> {
	const store = await cookies();
	const idToken = store.get(COOKIE_ID)?.value;
	if (!idToken) return null;
	return decodeSessionFromIdToken(idToken);
}

export async function getRefreshToken(): Promise<string | null> {
	const store = await cookies();
	return store.get(COOKIE_REFRESH)?.value ?? null;
}

export async function getAccessToken(): Promise<string | null> {
	const store = await cookies();
	return store.get(COOKIE_ACCESS)?.value ?? null;
}

export async function clearSession(): Promise<void> {
	const store = await cookies();
	store.delete(COOKIE_ID);
	store.delete(COOKIE_ACCESS);
	store.delete(COOKIE_REFRESH);
}

export async function getValidAccessTokenServer(): Promise<string | null> {
	const accessToken = await getAccessToken();
	if (accessToken) return accessToken;
	const refreshToken = await getRefreshToken();
	if (!refreshToken) return null;
	try {
		const refreshed = await cognitoRefreshTokens(refreshToken);
		await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
		return refreshed.accessToken;
	} catch (error) {
		// 旧実装は空 catch で refresh 連続失敗が観測不能だった。
		// Server Component / RSC の read context では cookies を mutate できず、
		// invalid session の cleanup は write-capable な Route Handler
		// (`/api/auth/me`, `/api/proxy`, `/api/auth/refresh`) 側に委ねる。
		// ここでは null を返しつつ観測ログだけ残す。
		// 期待される失敗 (refresh token 失効) と想定外 (network 障害) を
		// 区別する余地はあるが、この層は呼び出し元の挙動に影響しないため warn 止まり。
		console.warn("getValidAccessTokenServer refresh failed", {
			name: error instanceof Error ? error.name : "unknown",
			message: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

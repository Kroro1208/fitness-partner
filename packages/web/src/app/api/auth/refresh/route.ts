import { NextResponse } from "next/server";

import { cognitoRefreshTokens } from "@/lib/auth/cognito";
import { handleAuthError } from "@/lib/auth/errors";
import {
	clearSession,
	getRefreshToken,
	setRefreshedTokens,
} from "@/lib/auth/session";
import { enforceSameOrigin } from "@/lib/security/request-guard";

export async function POST(request: Request) {
	try {
		const origin = enforceSameOrigin(request);
		if (!origin.ok) return origin.response;

		const refreshToken = await getRefreshToken();
		if (!refreshToken) {
			return NextResponse.json({ error: "no_refresh_token" }, { status: 401 });
		}
		const refreshed = await cognitoRefreshTokens(refreshToken);
		await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
		return NextResponse.json({ success: true });
	} catch (error) {
		await clearSession();
		return handleAuthError(error);
	}
}

import { NextResponse } from "next/server";

import { cognitoRefreshTokens } from "@/lib/auth/cognito";
import {
	clearSession,
	getRefreshToken,
	getSession,
	setRefreshedTokens,
} from "@/lib/auth/session";

export async function GET() {
	let session = await getSession();
	if (!session) {
		const refreshToken = await getRefreshToken();
		if (refreshToken) {
			try {
				const refreshed = await cognitoRefreshTokens(refreshToken);
				await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
				session = await getSession();
			} catch {
				await clearSession();
			}
		}
	}
	if (!session) {
		return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
	}
	return NextResponse.json({
		user: { id: session.userId, email: session.email },
	});
}

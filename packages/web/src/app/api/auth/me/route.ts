import { NextResponse } from "next/server";

import { cognitoRefreshTokens } from "@/lib/auth/cognito";
import {
	clearSession,
	getRefreshToken,
	getSession,
	setRefreshedTokens,
} from "@/lib/auth/session";
import { UnauthorizedError } from "@/shared/errors/app-error";
import { withRouteErrorHandling } from "@/shared/http/with-route-error-handling";

// /api/auth/me は「現在のセッション情報を返す」エンドポイント。
// id token cookie が無い場合は refresh token で再発行を試み、それも失敗なら
// 401 を返す。refresh 失敗時はセッション全体を破棄する (refresh.ts と同じ理由)。

export const GET = withRouteErrorHandling(async () => {
	let session = await getSession();
	if (!session) {
		const refreshToken = await getRefreshToken();
		if (refreshToken) {
			try {
				const refreshed = await cognitoRefreshTokens(refreshToken);
				await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
				session = await getSession();
			} catch (error) {
				// 旧実装は空 catch だったため、refresh 失敗の頻度や原因が
				// 観測できなかった。warn で残し、cookie は破棄する。
				// この throw は wrapper では使わない (呼び出し元は 401 を期待しているため
				// throw すると 500 になってしまう) ため、ここでは握って観測ログだけ残す。
				console.warn("/api/auth/me refresh failed", {
					name: error instanceof Error ? error.name : "unknown",
					message: error instanceof Error ? error.message : String(error),
				});
				await clearSession();
			}
		}
	}
	if (!session) {
		throw new UnauthorizedError("unauthenticated");
	}
	return NextResponse.json({
		user: { id: session.userId, email: session.email },
	});
});

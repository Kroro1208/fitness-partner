import { NextResponse } from "next/server";

import { cognitoRefreshTokens } from "@/lib/auth/cognito";
import {
	clearSession,
	getRefreshToken,
	setRefreshedTokens,
} from "@/lib/auth/session";
import { enforceSameOrigin } from "@/lib/security/request-guard";
import { UnauthorizedError } from "@/shared/errors/app-error";
import { withRouteErrorHandling } from "@/shared/http/with-route-error-handling";

// refresh は失敗時に session cookie を削除する副作用がある (再ログイン誘導)。
// `withRouteErrorHandling` の素の利用では副作用フックを持たないため、
// 内部 try/catch で `clearSession()` を実行してから throw を継続する。
//
// 「全 route で try/catch を散らさない」原則と矛盾しないか?
//   - 否。これは "副作用付き境界" の例外ケース。
//     共通 wrapper は HTTP 変換だけを担い、ビジネス的副作用 (cookie 失効) は
//     route 自身の責務として明示的に書く方が読みやすい。

export const POST = withRouteErrorHandling(async (request: Request) => {
	enforceSameOrigin(request);

	const refreshToken = await getRefreshToken();
	if (!refreshToken) {
		throw new UnauthorizedError("no_refresh_token");
	}

	try {
		const refreshed = await cognitoRefreshTokens(refreshToken);
		await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
		return NextResponse.json({ success: true });
	} catch (error) {
		// refresh が失敗した = refresh token が失効しているか SDK 障害。
		// 失効ならセッション全体を破棄して再ログイン誘導が必要。
		// 障害ケースで session を消すのは過剰だが、判別が SDK 例外名依存で
		// 信頼性が低いため、安全側 (常に clear) に倒している。
		await clearSession();
		throw error;
	}
});

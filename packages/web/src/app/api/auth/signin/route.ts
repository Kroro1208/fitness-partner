import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoSignIn } from "@/lib/auth/cognito";
import { setSession } from "@/lib/auth/session";
import {
	enforceRateLimitsOrThrow,
	getClientIp,
} from "@/lib/security/rate-limit";
import { enforceSameOrigin } from "@/lib/security/request-guard";
import { withRouteErrorHandling } from "@/shared/http/with-route-error-handling";

// 旧来は handler 全体を try/catch で囲んで `handleAuthError(e)` していたが、
// この pattern は signup / signup-confirm / refresh で 4 重に重複していた。
// `withRouteErrorHandling` で集約することで:
//  - ZodError / SyntaxError / Cognito 例外 / unknown error の変換を 1 箇所に
//  - guard 系 (origin / rate-limit) は throw に統一されたため if/return の連鎖が消える
//  - 各 route はビジネスロジック本筋だけ書けばよい

const bodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

const SIGNIN_IP_LIMIT = {
	bucket: "auth:signin:ip",
	limit: 10,
	windowMs: 60_000,
} as const;

const SIGNIN_EMAIL_LIMIT = {
	bucket: "auth:signin:email",
	limit: 5,
	windowMs: 5 * 60_000,
} as const;

export const POST = withRouteErrorHandling(async (request: NextRequest) => {
	enforceSameOrigin(request);

	const ip = getClientIp(request);
	enforceRateLimitsOrThrow([{ ...SIGNIN_IP_LIMIT, key: ip }]);

	const json = await request.json();
	const { email, password } = bodySchema.parse(json);

	// email 単位の rate limit は "正規化済み email" を bucket key にしないと
	// 大文字小文字違いで bypass される。lowercase 正規化はここで行う。
	enforceRateLimitsOrThrow([
		{ ...SIGNIN_EMAIL_LIMIT, key: email.toLowerCase() },
	]);

	const tokens = await cognitoSignIn(email, password);
	await setSession(tokens);
	return NextResponse.json({ success: true });
});

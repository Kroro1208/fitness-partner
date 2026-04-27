import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoSignUp } from "@/lib/auth/cognito";
import {
	enforceRateLimitsOrThrow,
	getClientIp,
} from "@/lib/security/rate-limit";
import { enforceSameOrigin } from "@/lib/security/request-guard";
import { withRouteErrorHandling } from "@/shared/http/with-route-error-handling";

const bodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	// PreSignUp Lambda は trim しないため、コピペの前後空白で弾かれないようにする
	inviteCode: z.string().trim().min(1),
});

const SIGNUP_IP_LIMIT = {
	bucket: "auth:signup:ip",
	limit: 5,
	windowMs: 10 * 60_000,
} as const;

const SIGNUP_EMAIL_LIMIT = {
	bucket: "auth:signup:email",
	limit: 3,
	windowMs: 30 * 60_000,
} as const;

export const POST = withRouteErrorHandling(async (request: NextRequest) => {
	enforceSameOrigin(request);

	const ip = getClientIp(request);
	enforceRateLimitsOrThrow([{ ...SIGNUP_IP_LIMIT, key: ip }]);

	const json = await request.json();
	const { email, password, inviteCode } = bodySchema.parse(json);

	enforceRateLimitsOrThrow([
		{ ...SIGNUP_EMAIL_LIMIT, key: email.toLowerCase() },
	]);

	await cognitoSignUp(email, password, inviteCode);
	return NextResponse.json({ needsConfirmation: true });
});

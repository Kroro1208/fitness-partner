import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoConfirmSignUp } from "@/lib/auth/cognito";
import {
	enforceRateLimitsOrThrow,
	getClientIp,
} from "@/lib/security/rate-limit";
import { enforceSameOrigin } from "@/lib/security/request-guard";
import { withRouteErrorHandling } from "@/shared/http/with-route-error-handling";

const bodySchema = z.object({
	email: z.string().email(),
	code: z.string().min(1),
});

const SIGNUP_CONFIRM_IP_LIMIT = {
	bucket: "auth:signup-confirm:ip",
	limit: 10,
	windowMs: 10 * 60_000,
} as const;

const SIGNUP_CONFIRM_EMAIL_LIMIT = {
	bucket: "auth:signup-confirm:email",
	limit: 6,
	windowMs: 10 * 60_000,
} as const;

export const POST = withRouteErrorHandling(async (request: NextRequest) => {
	enforceSameOrigin(request);

	const ip = getClientIp(request);
	enforceRateLimitsOrThrow([{ ...SIGNUP_CONFIRM_IP_LIMIT, key: ip }]);

	const json = await request.json();
	const { email, code } = bodySchema.parse(json);

	enforceRateLimitsOrThrow([
		{ ...SIGNUP_CONFIRM_EMAIL_LIMIT, key: email.toLowerCase() },
	]);

	await cognitoConfirmSignUp(email, code);
	return NextResponse.json({ success: true });
});

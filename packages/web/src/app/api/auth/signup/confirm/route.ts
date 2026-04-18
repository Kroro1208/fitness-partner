import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoConfirmSignUp } from "@/lib/auth/cognito";
import { handleAuthError } from "@/lib/auth/errors";
import {
	enforceRateLimits,
	getClientIp,
	rateLimitedResponse,
} from "@/lib/security/rate-limit";

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

export async function POST(request: NextRequest) {
	try {
		const ip = getClientIp(request);
		const ipRateLimit = enforceRateLimits([
			{ ...SIGNUP_CONFIRM_IP_LIMIT, key: ip },
		]);
		if (!ipRateLimit.allowed) {
			return rateLimitedResponse(ipRateLimit.retryAfterSeconds);
		}

		const json = await request.json();
		const { email, code } = bodySchema.parse(json);
		const emailRateLimit = enforceRateLimits([
			{ ...SIGNUP_CONFIRM_EMAIL_LIMIT, key: email.toLowerCase() },
		]);
		if (!emailRateLimit.allowed) {
			return rateLimitedResponse(emailRateLimit.retryAfterSeconds);
		}

		await cognitoConfirmSignUp(email, code);
		return NextResponse.json({ success: true });
	} catch (error) {
		return handleAuthError(error);
	}
}

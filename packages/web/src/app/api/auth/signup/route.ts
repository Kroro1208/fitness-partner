import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoSignUp } from "@/lib/auth/cognito";
import { handleAuthError } from "@/lib/auth/errors";
import {
	enforceRateLimits,
	getClientIp,
	rateLimitedResponse,
} from "@/lib/security/rate-limit";

const bodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	inviteCode: z.string().min(1),
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

export async function POST(request: NextRequest) {
	try {
		const ip = getClientIp(request);
		const ipRateLimit = enforceRateLimits([{ ...SIGNUP_IP_LIMIT, key: ip }]);
		if (!ipRateLimit.allowed) {
			return rateLimitedResponse(ipRateLimit.retryAfterSeconds);
		}

		const json = await request.json();
		const { email, password, inviteCode } = bodySchema.parse(json);
		const emailRateLimit = enforceRateLimits([
			{ ...SIGNUP_EMAIL_LIMIT, key: email.toLowerCase() },
		]);
		if (!emailRateLimit.allowed) {
			return rateLimitedResponse(emailRateLimit.retryAfterSeconds);
		}

		await cognitoSignUp(email, password, inviteCode);
		return NextResponse.json({ needsConfirmation: true });
	} catch (error) {
		return handleAuthError(error);
	}
}

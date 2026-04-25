import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoSignIn } from "@/lib/auth/cognito";
import { handleAuthError } from "@/lib/auth/errors";
import { setSession } from "@/lib/auth/session";
import {
	enforceRateLimits,
	getClientIp,
	rateLimitedResponse,
} from "@/lib/security/rate-limit";
import { enforceSameOrigin } from "@/lib/security/request-guard";

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

export async function POST(request: NextRequest) {
	try {
		const origin = enforceSameOrigin(request);
		if (!origin.ok) return origin.response;

		const ip = getClientIp(request);
		const ipRateLimit = enforceRateLimits([{ ...SIGNIN_IP_LIMIT, key: ip }]);
		if (!ipRateLimit.allowed) {
			return rateLimitedResponse(ipRateLimit.retryAfterSeconds);
		}

		const json = await request.json();
		const { email, password } = bodySchema.parse(json);
		const emailRateLimit = enforceRateLimits([
			{ ...SIGNIN_EMAIL_LIMIT, key: email.toLowerCase() },
		]);
		if (!emailRateLimit.allowed) {
			return rateLimitedResponse(emailRateLimit.retryAfterSeconds);
		}

		const tokens = await cognitoSignIn(email, password);
		await setSession(tokens);
		return NextResponse.json({ success: true });
	} catch (error) {
		return handleAuthError(error);
	}
}

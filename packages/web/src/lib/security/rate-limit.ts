import { type NextRequest, NextResponse } from "next/server";

type RateLimitEntry = {
	count: number;
	resetAt: number;
};

type RateLimitRule = {
	bucket: string;
	key: string;
	limit: number;
	windowMs: number;
};

type RateLimitResult =
	| { allowed: true }
	| { allowed: false; retryAfterSeconds: number };

const rateLimitStore = new Map<string, RateLimitEntry>();

function rateLimitStoreKey(bucket: string, key: string): string {
	return `${bucket}:${key}`;
}

function cleanupExpiredEntries(now: number): void {
	for (const [key, entry] of rateLimitStore.entries()) {
		if (entry.resetAt <= now) {
			rateLimitStore.delete(key);
		}
	}
}

export function consumeRateLimit(
	rule: RateLimitRule,
	now: number = Date.now(),
): RateLimitResult {
	cleanupExpiredEntries(now);

	const storeKey = rateLimitStoreKey(rule.bucket, rule.key);
	const existing = rateLimitStore.get(storeKey);

	if (!existing || existing.resetAt <= now) {
		rateLimitStore.set(storeKey, {
			count: 1,
			resetAt: now + rule.windowMs,
		});
		return { allowed: true };
	}

	if (existing.count >= rule.limit) {
		return {
			allowed: false,
			retryAfterSeconds: Math.max(
				1,
				Math.ceil((existing.resetAt - now) / 1000),
			),
		};
	}

	existing.count += 1;
	rateLimitStore.set(storeKey, existing);
	return { allowed: true };
}

export function enforceRateLimits(
	rules: readonly RateLimitRule[],
	now: number = Date.now(),
): RateLimitResult {
	let retryAfterSeconds = 0;

	for (const rule of rules) {
		const result = consumeRateLimit(rule, now);
		if (!result.allowed) {
			retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
		}
	}

	if (retryAfterSeconds > 0) {
		return { allowed: false, retryAfterSeconds };
	}

	return { allowed: true };
}

export function getClientIp(request: NextRequest): string {
	const forwardedFor = request.headers.get("x-forwarded-for");
	if (forwardedFor) {
		const first = forwardedFor.split(",")[0]?.trim();
		if (first) return first;
	}

	const realIp = request.headers.get("x-real-ip")?.trim();
	if (realIp) return realIp;

	const cfConnectingIp = request.headers.get("cf-connecting-ip")?.trim();
	if (cfConnectingIp) return cfConnectingIp;

	return "unknown";
}

export function rateLimitedResponse(retryAfterSeconds: number): NextResponse {
	return NextResponse.json(
		{ error: "rate_limited" },
		{
			status: 429,
			headers: {
				"Cache-Control": "no-store",
				"Retry-After": String(retryAfterSeconds),
			},
		},
	);
}

export function resetRateLimitStoreForTest(): void {
	rateLimitStore.clear();
}

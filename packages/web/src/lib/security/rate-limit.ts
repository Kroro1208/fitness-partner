// インメモリのレート制限。
//
// なぜ NextResponse を返す `rateLimitedResponse` を廃止したか:
//   - 旧 API は `if (!result.allowed) return rateLimitedResponse(s);` という
//     「lib が NextResponse を生成して route が return する」二段構成だった。
//     これは AP2 (lib に HTTP 層が漏れる) 違反で、wrapper 集約も妨げていた。
//   - `enforceRateLimitsOrThrow` に変えることで、route handler 側は
//     1 行で済み、429 + Retry-After は AppError 側 (RateLimitedError) が持つ。
//
// 注意: モジュールスコープの Map はプロセス内共有。
//   - Vercel Functions のコールドスタート / 複数 instance では分散しない。
//   - 将来的に Upstash Redis 等への移行が必要だが、本 PR の責務外。

import type { NextRequest } from "next/server";

import { RateLimitedError } from "@/shared/errors/app-error";

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
	const results = rules.map((rule) => consumeRateLimit(rule, now));
	const retryAfterSeconds = maxRetryAfterSeconds(results);

	if (retryAfterSeconds > 0) {
		return { allowed: false, retryAfterSeconds };
	}

	return { allowed: true };
}

/**
 * `enforceRateLimits` の throw 版。
 * Route Handler では allowed 判定 → 即 RateLimitedError throw が定型なので
 * 1 行で済むようにした。`withRouteErrorHandling` 配下で使うこと。
 */
export function enforceRateLimitsOrThrow(
	rules: readonly RateLimitRule[],
	now: number = Date.now(),
): void {
	const result = enforceRateLimits(rules, now);
	if (!result.allowed) {
		throw new RateLimitedError(result.retryAfterSeconds);
	}
}

/**
 * `consumeRateLimit` の throw 版。単一ルールのときに使う。
 */
export function consumeRateLimitOrThrow(
	rule: RateLimitRule,
	now: number = Date.now(),
): void {
	const result = consumeRateLimit(rule, now);
	if (!result.allowed) {
		throw new RateLimitedError(result.retryAfterSeconds);
	}
}

function maxRetryAfterSeconds(results: readonly RateLimitResult[]): number {
	return results
		.filter(
			(result): result is { allowed: false; retryAfterSeconds: number } =>
				result.allowed === false,
		)
		.reduce(
			(maxRetryAfter, result) =>
				Math.max(maxRetryAfter, result.retryAfterSeconds),
			0,
		);
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

export function resetRateLimitStoreForTest(): void {
	rateLimitStore.clear();
}

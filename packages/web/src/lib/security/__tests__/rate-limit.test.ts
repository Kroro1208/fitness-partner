import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";

import {
	consumeRateLimit,
	enforceRateLimits,
	getClientIp,
	resetRateLimitStoreForTest,
} from "../rate-limit";

const ipRule = (
	overrides: Partial<Parameters<typeof consumeRateLimit>[0]> = {},
) => ({
	bucket: "auth:signin:ip",
	key: "127.0.0.1",
	limit: 2,
	windowMs: 60_000,
	...overrides,
});

const emailRule = (
	overrides: Partial<Parameters<typeof consumeRateLimit>[0]> = {},
) => ({
	bucket: "auth:signin:email",
	key: "user@example.com",
	limit: 2,
	windowMs: 60_000,
	...overrides,
});

describe("rate-limit", () => {
	beforeEach(() => {
		resetRateLimitStoreForTest();
	});

	describe("consumeRateLimit", () => {
		it("ウィンドウ内で上限を超えた場合はブロックする", () => {
			expect(consumeRateLimit(ipRule(), 1_000)).toEqual({ allowed: true });
			expect(consumeRateLimit(ipRule(), 2_000)).toEqual({ allowed: true });
			expect(consumeRateLimit(ipRule(), 3_000)).toEqual({
				allowed: false,
				retryAfterSeconds: 58,
			});
		});

		it("ウィンドウが切れた後は再度許可に戻る", () => {
			consumeRateLimit(ipRule({ limit: 1 }), 1_000);
			expect(consumeRateLimit(ipRule({ limit: 1 }), 30_000)).toEqual({
				allowed: false,
				retryAfterSeconds: 31,
			});

			expect(consumeRateLimit(ipRule({ limit: 1 }), 61_001)).toEqual({
				allowed: true,
			});
		});

		it("ウィンドウ終了直前でも Retry-After は最低 1 秒を返す", () => {
			consumeRateLimit(ipRule({ limit: 1 }), 1_000);
			expect(consumeRateLimit(ipRule({ limit: 1 }), 60_500)).toEqual({
				allowed: false,
				retryAfterSeconds: 1,
			});
		});

		it("異なるバケットは互いに干渉しない", () => {
			consumeRateLimit(ipRule({ limit: 1 }), 1_000);
			expect(
				consumeRateLimit(ipRule({ limit: 1, bucket: "other" }), 1_000),
			).toEqual({ allowed: true });
		});
	});

	describe("enforceRateLimits", () => {
		it("全てのバケットが上限内なら許可する", () => {
			expect(
				enforceRateLimits(
					[ipRule({ limit: 1 }), emailRule({ limit: 2 })],
					1_000,
				),
			).toEqual({ allowed: true });
		});

		it("いずれかのバケットが上限を超えた場合はブロックし、最長の retry-after を返す", () => {
			enforceRateLimits([ipRule({ limit: 1 }), emailRule({ limit: 2 })], 1_000);

			expect(
				enforceRateLimits(
					[ipRule({ limit: 1 }), emailRule({ limit: 2 })],
					2_000,
				),
			).toEqual({
				allowed: false,
				retryAfterSeconds: 59,
			});
		});
	});

	describe("getClientIp", () => {
		it.each([
			[
				"x-forwarded-for の先頭 IP を返す",
				{ "x-forwarded-for": "198.51.100.10, 10.0.0.1" },
				"198.51.100.10",
			],
			[
				"x-forwarded-for が無い場合は x-real-ip にフォールバックする",
				{ "x-real-ip": "203.0.113.5" },
				"203.0.113.5",
			],
			[
				"他のヘッダが無い場合は cf-connecting-ip にフォールバックする",
				{ "cf-connecting-ip": "203.0.113.6" },
				"203.0.113.6",
			],
			["識別可能なヘッダが無い場合は 'unknown' を返す", {}, "unknown"],
		])("%s", (_name, headers, expected) => {
			const request = new NextRequest("http://localhost:3000/api/auth/signin", {
				headers: headers as Record<string, string>,
			});
			expect(getClientIp(request)).toBe(expected);
		});

		it("x-forwarded-for が空白のみの場合は x-real-ip にフォールバックする", () => {
			const request = new NextRequest("http://localhost:3000/api/auth/signin", {
				headers: {
					"x-forwarded-for": "   ",
					"x-real-ip": "203.0.113.9",
				},
			});

			expect(getClientIp(request)).toBe("203.0.113.9");
		});
	});
});

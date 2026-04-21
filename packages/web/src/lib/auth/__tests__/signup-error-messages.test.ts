import { describe, expect, it } from "vitest";

import {
	CONFIRM_AUTH_FAILED_MESSAGE,
	resolveConfirmErrorMessage,
	resolveSignInErrorMessage,
	resolveSignupErrorMessage,
} from "../signup-error-messages";

describe("resolveSignupErrorMessage", () => {
	it("status 429 with valid Retry-After seconds returns minutes-rounded message", () => {
		const msg = resolveSignupErrorMessage({
			status: 429,
			retryAfter: "120",
			errorCode: undefined,
		});
		expect(msg).toContain("約 2 分後");
	});

	it("status 429 with missing Retry-After falls back to generic rate-limit message", () => {
		const msg = resolveSignupErrorMessage({
			status: 429,
			retryAfter: null,
			errorCode: undefined,
		});
		expect(msg).toContain("しばらくしてから");
	});

	it("status 429 with non-numeric Retry-After falls back to generic rate-limit message", () => {
		const msg = resolveSignupErrorMessage({
			status: 429,
			retryAfter: "not-a-number",
			errorCode: undefined,
		});
		expect(msg).toContain("しばらくしてから");
	});

	it("maps known error code to its dedicated message", () => {
		expect(
			resolveSignupErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "invalid_input",
			}),
		).toBe("入力内容を確認してください");

		expect(
			resolveSignupErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "invite_validation_failed",
			}),
		).toContain("招待コード");

		expect(
			resolveSignupErrorMessage({
				status: 503,
				retryAfter: null,
				errorCode: "auth_upstream_unavailable",
			}),
		).toContain("一時的に利用できません");
	});

	it("unknown error code with 5xx falls back to server-error message", () => {
		const msg = resolveSignupErrorMessage({
			status: 502,
			retryAfter: null,
			errorCode: "something_new",
		});
		expect(msg).toContain("サーバー側の不具合");
	});

	it("unknown error code with 4xx falls back to generic message", () => {
		const msg = resolveSignupErrorMessage({
			status: 400,
			retryAfter: null,
			errorCode: undefined,
		});
		expect(msg).toContain("改善しない場合は管理者");
	});

	it("non-string errorCode is ignored for mapping", () => {
		const msg = resolveSignupErrorMessage({
			status: 400,
			retryAfter: null,
			errorCode: { nested: "invalid_input" },
		});
		expect(msg).not.toBe("入力内容を確認してください");
	});
});

describe("resolveConfirmErrorMessage", () => {
	it("invalid_input returns dedicated message", () => {
		expect(
			resolveConfirmErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "invalid_input",
			}),
		).toBe("入力内容を確認してください");
	});

	it("auth_failed returns confirmation-specific guidance", () => {
		expect(
			resolveConfirmErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "auth_failed",
			}),
		).toBe(CONFIRM_AUTH_FAILED_MESSAGE);
	});

	it("status 429 surfaces wait guidance", () => {
		expect(
			resolveConfirmErrorMessage({
				status: 429,
				retryAfter: "120",
				errorCode: "rate_limited",
			}),
		).toContain("約 2 分後");
	});

	it("unknown errorCode falls back", () => {
		expect(
			resolveConfirmErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "something_new",
			}),
		).toBe("確認に失敗しました。時間をおいて再度お試しください");
		expect(
			resolveConfirmErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: undefined,
			}),
		).toBe("確認に失敗しました。時間をおいて再度お試しください");
	});
});

describe("resolveSignInErrorMessage", () => {
	it("invalid_input returns dedicated message", () => {
		expect(
			resolveSignInErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "invalid_input",
			}),
		).toBe("入力内容を確認してください");
	});

	it("auth_failed returns invalid credentials guidance", () => {
		expect(
			resolveSignInErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "auth_failed",
			}),
		).toContain("メールアドレスまたはパスワード");
	});

	it("status 429 surfaces wait guidance", () => {
		expect(
			resolveSignInErrorMessage({
				status: 429,
				retryAfter: "120",
				errorCode: "rate_limited",
			}),
		).toContain("約 2 分後");
	});

	it("5xx falls back to server-specific guidance", () => {
		expect(
			resolveSignInErrorMessage({
				status: 500,
				retryAfter: null,
				errorCode: "internal_error",
			}),
		).toContain("サーバー側の不具合");
	});

	it("unknown 4xx falls back to generic message", () => {
		expect(
			resolveSignInErrorMessage({
				status: 400,
				retryAfter: null,
				errorCode: "something_new",
			}),
		).toBe(
			"ログインに失敗しました。通信や入力内容を確認し、改善しない場合は管理者に連絡してください",
		);
	});
});

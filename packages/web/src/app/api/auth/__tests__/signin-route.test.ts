import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cognitoSignInMock, setSessionMock } = vi.hoisted(() => ({
	cognitoSignInMock: vi.fn(),
	setSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth/cognito", () => ({
	cognitoSignIn: cognitoSignInMock,
}));

vi.mock("@/lib/auth/session", () => ({
	setSession: setSessionMock,
}));

import { resetRateLimitStoreForTest } from "@/lib/security/rate-limit";
import { POST } from "../signin/route";

const SUCCESSFUL_TOKENS = {
	idToken: "id-token",
	accessToken: "access-token",
	refreshToken: "refresh-token",
	expiresIn: 3600,
} as const;

function makeSigninRequest(params: {
	email: string;
	password?: string;
	ip?: string;
	body?: unknown;
}) {
	const headers: Record<string, string> = {
		"content-type": "application/json",
	};
	if (params.ip) headers["x-forwarded-for"] = params.ip;

	const body =
		"body" in params
			? params.body
			: { email: params.email, password: params.password ?? "Password123!" };

	return new NextRequest("http://localhost:3000/api/auth/signin", {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});
}

describe("signin route", () => {
	beforeEach(() => {
		resetRateLimitStoreForTest();
		cognitoSignInMock.mockReset();
		setSessionMock.mockReset();
		cognitoSignInMock.mockResolvedValue(SUCCESSFUL_TOKENS);
	});

	describe("正常系", () => {
		it("200 と success レスポンスを返し、セッションを保存する", async () => {
			const response = await POST(
				makeSigninRequest({ email: "user@example.com", ip: "198.51.100.1" }),
			);

			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ success: true });
			expect(cognitoSignInMock).toHaveBeenCalledWith(
				"user@example.com",
				"Password123!",
			);
			expect(setSessionMock).toHaveBeenCalledWith(SUCCESSFUL_TOKENS);
		});
	});

	describe("IP 単位のレート制限", () => {
		it("同一 IP から上限を超えた場合 429 を返す", async () => {
			for (let i = 0; i < 10; i += 1) {
				const response = await POST(
					makeSigninRequest({
						email: `user${i}@example.com`,
						ip: "198.51.100.10",
					}),
				);
				expect(response.status).toBe(200);
			}

			const blocked = await POST(
				makeSigninRequest({
					email: "blocked@example.com",
					ip: "198.51.100.10",
				}),
			);

			expect(blocked.status).toBe(429);
			expect(blocked.headers.get("Retry-After")).not.toBeNull();
			expect(await blocked.json()).toEqual({ error: "rate_limited" });
			expect(cognitoSignInMock).toHaveBeenCalledTimes(10);
		});
	});

	describe("email 単位のレート制限", () => {
		it("異なる IP から同一 email で上限を超えた場合 429 を返す", async () => {
			for (let i = 0; i < 5; i += 1) {
				const response = await POST(
					makeSigninRequest({
						email: "target@example.com",
						ip: `203.0.113.${i + 1}`,
					}),
				);
				expect(response.status).toBe(200);
			}

			const blocked = await POST(
				makeSigninRequest({
					email: "target@example.com",
					ip: "203.0.113.99",
				}),
			);

			expect(blocked.status).toBe(429);
			expect(blocked.headers.get("Retry-After")).not.toBeNull();
			expect(await blocked.json()).toEqual({ error: "rate_limited" });
			expect(cognitoSignInMock).toHaveBeenCalledTimes(5);
		});

		it("email は lowercase 正規化されるため大文字小文字が違っても同じバケットに入る", async () => {
			for (const email of [
				"Mixed@Example.com",
				"mixed@example.com",
				"MIXED@EXAMPLE.COM",
				"mIxEd@ExAmPlE.cOm",
				"MiXeD@eXaMpLe.CoM",
			]) {
				const response = await POST(
					makeSigninRequest({
						email,
						ip: `203.0.113.${Math.floor(Math.random() * 200) + 1}`,
					}),
				);
				expect(response.status).toBe(200);
			}

			const blocked = await POST(
				makeSigninRequest({
					email: "MIXED@example.com",
					ip: "203.0.113.250",
				}),
			);
			expect(blocked.status).toBe(429);
		});
	});

	describe("入力バリデーション", () => {
		it.each([
			["email 形式が不正な場合", { email: "not-email", password: "x" }],
			["email が欠落している場合", { password: "x" }],
			["password が空文字の場合", { email: "user@example.com", password: "" }],
			["ボディがオブジェクトでない場合", "invalid-json-but-string"],
		])("%s は 400 を返す", async (_name, body) => {
			const response = await POST(
				makeSigninRequest({
					email: "unused@example.com",
					ip: "198.51.100.50",
					body,
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({ error: "invalid_input" });
			expect(cognitoSignInMock).not.toHaveBeenCalled();
			expect(setSessionMock).not.toHaveBeenCalled();
		});
	});

	describe("Cognito エラーハンドリング", () => {
		it("公開可能な認証失敗例外の場合は 400 auth_failed を返す", async () => {
			const error = new Error("invalid");
			error.name = "NotAuthorizedException";
			cognitoSignInMock.mockRejectedValueOnce(error);

			const response = await POST(
				makeSigninRequest({
					email: "user@example.com",
					ip: "198.51.100.60",
				}),
			);

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "auth_failed" });
			expect(setSessionMock).not.toHaveBeenCalled();
		});

		it("予期しない例外の場合は 500 internal_error を返す", async () => {
			cognitoSignInMock.mockRejectedValueOnce(new Error("network blew up"));

			const response = await POST(
				makeSigninRequest({
					email: "user@example.com",
					ip: "198.51.100.61",
				}),
			);

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: "internal_error" });
			expect(setSessionMock).not.toHaveBeenCalled();
		});
	});
});

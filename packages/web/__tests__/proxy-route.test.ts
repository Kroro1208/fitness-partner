import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	getAccessTokenMock,
	getRefreshTokenMock,
	setRefreshedTokensMock,
	clearSessionMock,
	cognitoRefreshTokensMock,
} = vi.hoisted(() => ({
	getAccessTokenMock: vi.fn(),
	getRefreshTokenMock: vi.fn(),
	setRefreshedTokensMock: vi.fn(),
	clearSessionMock: vi.fn(),
	cognitoRefreshTokensMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
	getAccessToken: getAccessTokenMock,
	getRefreshToken: getRefreshTokenMock,
	setRefreshedTokens: setRefreshedTokensMock,
	clearSession: clearSessionMock,
}));

vi.mock("@/lib/auth/cognito", () => ({
	cognitoRefreshTokens: cognitoRefreshTokensMock,
}));

import { GET } from "../src/app/api/proxy/[...path]/route";

describe("proxy route", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		getAccessTokenMock.mockReset();
		getRefreshTokenMock.mockReset();
		setRefreshedTokensMock.mockReset();
		clearSessionMock.mockReset();
		cognitoRefreshTokensMock.mockReset();
		process.env.API_GATEWAY_URL = "https://api.example.com";
	});

	it("refreshes tokens before proxying when access token is missing", async () => {
		getAccessTokenMock.mockResolvedValueOnce(null);
		getRefreshTokenMock.mockResolvedValueOnce("refresh-token");
		cognitoRefreshTokensMock.mockResolvedValueOnce({
			idToken: "id-token-2",
			accessToken: "access-token-2",
			expiresIn: 3600,
		});

		const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);

		const response = await GET(
			new NextRequest("http://localhost:3000/api/proxy/users/me/profile"),
			{ params: Promise.resolve({ path: ["users", "me", "profile"] }) },
		);

		expect(response.status).toBe(200);
		expect(cognitoRefreshTokensMock).toHaveBeenCalledWith("refresh-token");
		expect(setRefreshedTokensMock).toHaveBeenCalledWith(
			"id-token-2",
			"access-token-2",
		);
		const [, init] = fetchSpy.mock.calls[0];
		expect((init as RequestInit).headers).toBeInstanceOf(Headers);
		expect(
			((init as RequestInit).headers as Headers).get("Authorization"),
		).toBe("Bearer access-token-2");
	});

	it("retries once after upstream 401 using refreshed access token", async () => {
		getAccessTokenMock.mockResolvedValueOnce("expired-access-token");
		getRefreshTokenMock.mockResolvedValueOnce("refresh-token");
		cognitoRefreshTokensMock.mockResolvedValueOnce({
			idToken: "id-token-2",
			accessToken: "access-token-2",
			expiresIn: 3600,
		});

		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "expired" }), {
					status: 401,
					headers: { "content-type": "application/json" },
				}),
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			);

		const response = await GET(
			new NextRequest("http://localhost:3000/api/proxy/users/me/profile"),
			{ params: Promise.resolve({ path: ["users", "me", "profile"] }) },
		);

		expect(response.status).toBe(200);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		const [, secondInit] = fetchSpy.mock.calls[1];
		expect(
			((secondInit as RequestInit).headers as Headers).get("Authorization"),
		).toBe("Bearer access-token-2");
	});
});

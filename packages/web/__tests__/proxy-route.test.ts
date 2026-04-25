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

import { GET, POST } from "../src/app/api/proxy/[...path]/route";

const PROXY_PATH = ["users", "me", "profile"];
const PROXY_URL = `http://localhost:3000/api/proxy/${PROXY_PATH.join("/")}`;

function okResponse(body: unknown = { ok: true }): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
	});
}

function unauthorizedResponse(): Response {
	return new Response(JSON.stringify({ error: "expired" }), {
		status: 401,
		headers: { "content-type": "application/json" },
	});
}

function invokeProxy(url: string = PROXY_URL) {
	return GET(new NextRequest(url), {
		params: Promise.resolve({ path: PROXY_PATH }),
	});
}

function invokeProxyPost(input: {
	url?: string;
	path?: string[];
	headers?: HeadersInit;
	body?: BodyInit;
}) {
	const path = input.path ?? ["users", "me", "meals"];
	const url = input.url ?? `http://localhost:3000/api/proxy/${path.join("/")}`;
	return POST(
		new NextRequest(url, {
			method: "POST",
			headers: input.headers,
			body: input.body,
		}),
		{ params: Promise.resolve({ path }) },
	);
}

function authHeader(init: RequestInit | undefined): string | null {
	const headers = init?.headers;
	expect(headers).toBeInstanceOf(Headers);
	if (!(headers instanceof Headers)) {
		throw new Error("Expected fetch init headers to be a Headers instance");
	}
	return headers.get("Authorization");
}

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

	describe("認可ヘッダの付与", () => {
		it("有効な access token を Bearer ヘッダで転送する", async () => {
			getAccessTokenMock.mockResolvedValueOnce("access-token-1");
			const fetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(okResponse());

			const response = await invokeProxy();

			expect(response.status).toBe(200);
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(authHeader(fetchSpy.mock.calls[0][1])).toBe(
				"Bearer access-token-1",
			);
			expect(cognitoRefreshTokensMock).not.toHaveBeenCalled();
		});

		it("access token が無い場合は先に refresh してから転送する", async () => {
			getAccessTokenMock.mockResolvedValueOnce(null);
			getRefreshTokenMock.mockResolvedValueOnce("refresh-token");
			cognitoRefreshTokensMock.mockResolvedValueOnce({
				idToken: "id-token-2",
				accessToken: "access-token-2",
				expiresIn: 3600,
			});
			const fetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(okResponse());

			const response = await invokeProxy();

			expect(response.status).toBe(200);
			expect(cognitoRefreshTokensMock).toHaveBeenCalledWith("refresh-token");
			expect(setRefreshedTokensMock).toHaveBeenCalledWith(
				"id-token-2",
				"access-token-2",
			);
			expect(authHeader(fetchSpy.mock.calls[0][1])).toBe(
				"Bearer access-token-2",
			);
		});

		it("upstream が 401 を返した場合は一度だけ refresh してリトライする", async () => {
			getAccessTokenMock.mockResolvedValueOnce("expired-access-token");
			getRefreshTokenMock.mockResolvedValueOnce("refresh-token");
			cognitoRefreshTokensMock.mockResolvedValueOnce({
				idToken: "id-token-2",
				accessToken: "access-token-2",
				expiresIn: 3600,
			});
			const fetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(unauthorizedResponse())
				.mockResolvedValueOnce(okResponse());

			const response = await invokeProxy();

			expect(response.status).toBe(200);
			expect(fetchSpy).toHaveBeenCalledTimes(2);
			expect(authHeader(fetchSpy.mock.calls[1][1])).toBe(
				"Bearer access-token-2",
			);
		});
	});

	describe("未認証レスポンス", () => {
		it("access token も refresh token も無い場合は 401 を返す", async () => {
			getAccessTokenMock.mockResolvedValueOnce(null);
			getRefreshTokenMock.mockResolvedValueOnce(null);
			const fetchSpy = vi.spyOn(globalThis, "fetch");

			const response = await invokeProxy();

			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: "unauthenticated" });
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(cognitoRefreshTokensMock).not.toHaveBeenCalled();
		});

		it("refresh に失敗した場合はセッションをクリアして 401 を返す", async () => {
			getAccessTokenMock.mockResolvedValueOnce(null);
			getRefreshTokenMock.mockResolvedValueOnce("refresh-token");
			cognitoRefreshTokensMock.mockRejectedValueOnce(
				new Error("refresh failed"),
			);
			const fetchSpy = vi.spyOn(globalThis, "fetch");

			const response = await invokeProxy();

			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: "unauthenticated" });
			expect(clearSessionMock).toHaveBeenCalledTimes(1);
			expect(fetchSpy).not.toHaveBeenCalled();
		});

		it("upstream 401 後の refresh も失敗した場合は 2 度目のリトライをせず 401 を返す", async () => {
			getAccessTokenMock.mockResolvedValueOnce("expired-access-token");
			getRefreshTokenMock
				.mockResolvedValueOnce("refresh-token")
				.mockResolvedValueOnce(null);
			cognitoRefreshTokensMock.mockRejectedValueOnce(
				new Error("refresh failed"),
			);
			const fetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(unauthorizedResponse());

			const response = await invokeProxy();

			expect(response.status).toBe(401);
			expect(await response.json()).toEqual({ error: "unauthenticated" });
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			expect(clearSessionMock).toHaveBeenCalledTimes(1);
		});
	});

	describe("設定エラー", () => {
		it("API_GATEWAY_URL が未設定の場合は 500 を返す", async () => {
			Reflect.deleteProperty(process.env, "API_GATEWAY_URL");
			getAccessTokenMock.mockResolvedValueOnce("access-token");
			const fetchSpy = vi.spyOn(globalThis, "fetch");

			const response = await invokeProxy();

			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({
				error: "api_gateway_url_not_configured",
			});
			expect(fetchSpy).not.toHaveBeenCalled();
		});
	});

	describe("upstream のパススルー", () => {
		it("upstream が非 2xx の場合も status と content-type をそのまま透過する", async () => {
			getAccessTokenMock.mockResolvedValueOnce("access-token");
			vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
				new Response(JSON.stringify({ error: "nope" }), {
					status: 404,
					headers: { "content-type": "application/json" },
				}),
			);

			const response = await invokeProxy();

			expect(response.status).toBe(404);
			expect(response.headers.get("content-type")).toBe("application/json");
			expect(await response.json()).toEqual({ error: "nope" });
		});

		it("リクエストの search params を upstream URL に引き継ぐ", async () => {
			getAccessTokenMock.mockResolvedValueOnce("access-token");
			const fetchSpy = vi
				.spyOn(globalThis, "fetch")
				.mockResolvedValueOnce(okResponse());

			await invokeProxy(`${PROXY_URL}?limit=10&cursor=abc`);

			const [url] = fetchSpy.mock.calls[0];
			expect(String(url)).toBe(
				"https://api.example.com/users/me/profile?limit=10&cursor=abc",
			);
		});

		describe("proxy hardening", () => {
			it("許可されていない upstream path は転送しない", async () => {
				getAccessTokenMock.mockResolvedValueOnce("access-token");
				const fetchSpy = vi.spyOn(globalThis, "fetch");

				const response = await invokeProxyPost({
					path: ["admin", "users"],
					body: JSON.stringify({ ok: true }),
				});

				expect(response.status).toBe(404);
				expect(await response.json()).toEqual({ error: "not_found" });
				expect(fetchSpy).not.toHaveBeenCalled();
			});

			it("変更系リクエストの cross-site Origin を拒否する", async () => {
				const fetchSpy = vi.spyOn(globalThis, "fetch");

				const response = await POST(
					{
						method: "POST",
						url: "http://app.example/api/proxy/users/me/meals",
						headers: new Headers({
							origin: "http://evil.example",
							"sec-fetch-site": "cross-site",
						}),
					} as unknown as NextRequest,
					{
						params: Promise.resolve({ path: ["users", "me", "meals"] }),
					},
				);

				expect(response.status).toBe(403);
				expect(await response.json()).toEqual({ error: "invalid_origin" });
				expect(fetchSpy).not.toHaveBeenCalled();
			});

			it("本文サイズ上限を超えるリクエストは upstream に転送しない", async () => {
				getAccessTokenMock.mockResolvedValueOnce("access-token");
				const fetchSpy = vi.spyOn(globalThis, "fetch");

				const response = await invokeProxyPost({
					body: "x".repeat(256 * 1024 + 1),
				});

				expect(response.status).toBe(413);
				expect(await response.json()).toEqual({ error: "payload_too_large" });
				expect(fetchSpy).not.toHaveBeenCalled();
			});
		});
	});
});

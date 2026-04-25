import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import { z } from "zod";

import { ApiError, apiClient, apiClientRaw } from "../api-client";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function textResponse(
	text: string,
	status = 200,
	contentType = "text/plain",
): Response {
	return new Response(text, {
		status,
		headers: { "content-type": contentType },
	});
}

let fetchSpy: MockInstance;

function lastFetchCall(): { url: string; init: RequestInit } {
	const call = fetchSpy.mock.calls[0];
	const rawInit: unknown = call[1] ?? {};
	if (typeof rawInit !== "object" || rawInit === null) {
		throw new Error("fetch init must be an object");
	}
	return { url: String(call[0]), init: rawInit as RequestInit };
}

beforeEach(() => {
	fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
	fetchSpy.mockRestore();
});

describe("apiClient", () => {
	it("成功時はスキーマで検証したボディを返す", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ hello: "world" }));

		const schema = z.object({ hello: z.string() });
		const result = await apiClient("users/me", schema);

		expect(result).toEqual({ hello: "world" });
	});

	it("スキーマに合わないボディは ZodError を投げる", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ hello: 123 }));

		const schema = z.object({ hello: z.string() });
		await expect(apiClient("users/me", schema)).rejects.toThrow();
	});

	it("相対パスは /api/proxy/ プレフィックスで fetch される", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}));

		await apiClientRaw("users/me");

		expect(lastFetchCall().url).toBe("/api/proxy/users/me");
	});

	it("先頭スラッシュ付きのパスでも二重スラッシュにならない", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}));

		await apiClientRaw("/users/me");

		expect(lastFetchCall().url).toBe("/api/proxy/users/me");
	});

	it("呼び出し側の headers をデフォルトヘッダとマージする", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}));

		await apiClientRaw("x", { headers: { "X-Custom": "1" } });

		expect(lastFetchCall().init.headers).toEqual({
			"Content-Type": "application/json",
			Accept: "application/json",
			"X-Custom": "1",
		});
	});

	it("method / body などの RequestInit をそのまま透過する", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({}));

		await apiClientRaw("x", {
			method: "PATCH",
			body: JSON.stringify({ a: 1 }),
		});

		const { init } = lastFetchCall();
		expect(init.method).toBe("PATCH");
		expect(init.body).toBe(JSON.stringify({ a: 1 }));
	});

	it("非 JSON レスポンスはテキストとして data に格納される", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("raw text"));

		const result = await apiClientRaw("x");

		expect(result).toBe("raw text");
	});

	it("非 JSON レスポンス本文の読み取り失敗は空文字に潰さず throw する", async () => {
		const res = textResponse("raw text");
		vi.spyOn(res, "text").mockRejectedValueOnce(new Error("stream failed"));
		fetchSpy.mockResolvedValueOnce(res);

		await expect(apiClientRaw("x")).rejects.toThrow(
			"Response body could not be read as text",
		);
	});

	it("4xx/5xx の場合は ApiError を投げる", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "nope" }, 500));

		await expect(apiClientRaw("x")).rejects.toBeInstanceOf(ApiError);
	});

	it("エラーボディに error フィールドがあればそれを message に使う", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({ error: "not_authorized" }, 401),
		);

		await expect(apiClientRaw("x")).rejects.toMatchObject({
			status: 401,
			message: "not_authorized",
			body: { error: "not_authorized" },
		});
	});

	it("エラーボディが JSON でない場合でも status を含む message で throw する", async () => {
		fetchSpy.mockResolvedValueOnce(textResponse("oops", 503));

		await expect(apiClientRaw("x")).rejects.toMatchObject({
			status: 503,
			message: "Request failed with status 503",
		});
	});
});

describe("ApiError", () => {
	it("status / body / message を保持する", () => {
		const err = new ApiError(404, { missing: true }, "not found");

		expect(err.status).toBe(404);
		expect(err.body).toEqual({ missing: true });
		expect(err.message).toBe("not found");
		expect(err.name).toBe("ApiError");
	});
});

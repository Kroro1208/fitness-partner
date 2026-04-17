import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "../proxy";

function makeRequest(path: string, hasSession: boolean): NextRequest {
	const url = `http://localhost:3000${path}`;
	const headers = new Headers();
	if (hasSession) headers.set("cookie", "__fitness_id=abc");
	return new NextRequest(url, { headers });
}

describe("proxy (auth guard)", () => {
	it("未認証で公開パス（/signin）にアクセスするとそのまま通す", () => {
		const res = proxy(makeRequest("/signin", false));
		expect(res.headers.get("location")).toBeNull();
		expect(res.status).toBe(200);
	});

	it("認証済みで保護パス（/home）にアクセスするとそのまま通す", () => {
		const res = proxy(makeRequest("/home", true));
		expect(res.headers.get("location")).toBeNull();
		expect(res.status).toBe(200);
	});

	it("定義外のパス（例: /about）は認証状態にかかわらず通す", () => {
		const unauth = proxy(makeRequest("/about", false));
		const auth = proxy(makeRequest("/about", true));
		expect(unauth.headers.get("location")).toBeNull();
		expect(auth.headers.get("location")).toBeNull();
	});

	it("未認証で /home にアクセスすると /signin にリダイレクトする", () => {
		const res = proxy(makeRequest("/home", false));
		expect(res.status).toBe(307);
		expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/signin");
	});

	it("未認証で /profile にアクセスすると /signin にリダイレクトする", () => {
		const res = proxy(makeRequest("/profile", false));
		expect(res.status).toBe(307);
		expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/signin");
	});

	it("未認証で /home/detail（保護パスの子）も /signin にリダイレクトする", () => {
		const res = proxy(makeRequest("/home/detail", false));
		expect(res.status).toBe(307);
		expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/signin");
	});

	it("認証済みで /signin にアクセスすると /home にリダイレクトする", () => {
		const res = proxy(makeRequest("/signin", true));
		expect(res.status).toBe(307);
		expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/home");
	});

	it("認証済みで /signup にアクセスすると /home にリダイレクトする", () => {
		const res = proxy(makeRequest("/signup", true));
		expect(res.status).toBe(307);
		expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/home");
	});

	it("__fitness_id cookie の値が空文字の場合も cookie 有と見なされる（現仕様）", () => {
		const url = "http://localhost:3000/home";
		const headers = new Headers({ cookie: "__fitness_id=" });
		const req = new NextRequest(url, { headers });

		const res = proxy(req);

		expect(res.status).toBe(200);
		expect(res.headers.get("location")).toBeNull();
	});
});

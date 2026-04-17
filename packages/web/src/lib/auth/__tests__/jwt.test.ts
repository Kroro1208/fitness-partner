import { describe, expect, it } from "vitest";

import { decodeSessionFromIdToken } from "../jwt";

function buildToken(payload: Record<string, unknown>): string {
	const header = Buffer.from(
		JSON.stringify({ alg: "RS256", typ: "JWT" }),
	).toString("base64url");
	const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${header}.${body}.signature`;
}

describe("decodeSessionFromIdToken", () => {
	// --- 正常系 ---
	it("有効な id token から userId と email を取り出す", () => {
		const token = buildToken({
			sub: "user-123",
			email: "taro@example.com",
			exp: Math.floor(Date.now() / 1000) + 3600,
		});

		const result = decodeSessionFromIdToken(token);

		expect(result).toEqual({ userId: "user-123", email: "taro@example.com" });
	});

	it("exp が未来の時刻なら session を返す", () => {
		const now = new Date("2026-04-17T00:00:00Z");
		const token = buildToken({
			sub: "user-1",
			email: "a@b.com",
			exp: Math.floor(now.getTime() / 1000) + 1,
		});

		const result = decodeSessionFromIdToken(token, now);

		expect(result).toEqual({ userId: "user-1", email: "a@b.com" });
	});

	// --- 入力値の異常 ---
	it("空文字の場合は null を返す", () => {
		expect(decodeSessionFromIdToken("")).toBeNull();
	});

	it("ドットで 3 分割できない文字列の場合は null を返す", () => {
		expect(decodeSessionFromIdToken("only.two")).toBeNull();
	});

	it("payload が base64url として不正な場合は null を返す", () => {
		const result = decodeSessionFromIdToken("header.!@#$%.signature");
		expect(result).toBeNull();
	});

	it("payload が JSON としてパースできない場合は null を返す", () => {
		const badBody = Buffer.from("not-json").toString("base64url");
		expect(decodeSessionFromIdToken(`header.${badBody}.signature`)).toBeNull();
	});

	// --- 状態の異常 ---
	it("payload に sub が無い場合は null を返す", () => {
		const token = buildToken({
			email: "taro@example.com",
			exp: Math.floor(Date.now() / 1000) + 3600,
		});
		expect(decodeSessionFromIdToken(token)).toBeNull();
	});

	it("payload に email が無い場合は null を返す", () => {
		const token = buildToken({
			sub: "user-1",
			exp: Math.floor(Date.now() / 1000) + 3600,
		});
		expect(decodeSessionFromIdToken(token)).toBeNull();
	});

	it("exp が過去の時刻の場合は null を返す（期限切れ）", () => {
		const now = new Date("2026-04-17T00:00:00Z");
		const token = buildToken({
			sub: "user-1",
			email: "a@b.com",
			exp: Math.floor(now.getTime() / 1000) - 1,
		});
		expect(decodeSessionFromIdToken(token, now)).toBeNull();
	});

	// --- 境界値 ---
	it("exp が現在時刻と同値の場合は null を返す（期限到達）", () => {
		const now = new Date("2026-04-17T00:00:00Z");
		const token = buildToken({
			sub: "user-1",
			email: "a@b.com",
			exp: Math.floor(now.getTime() / 1000),
		});
		expect(decodeSessionFromIdToken(token, now)).toBeNull();
	});
});

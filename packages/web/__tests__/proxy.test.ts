import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "../proxy";

function makeRequest(path: string): NextRequest {
	const url = `http://localhost:3000${path}`;
	return new NextRequest(url);
}

describe("proxy (auth guard)", () => {
	it("認証判定を行わず常にそのまま通す", () => {
		const res = proxy(makeRequest("/home"));
		expect(res.headers.get("location")).toBeNull();
		expect(res.status).toBe(200);
	});
});

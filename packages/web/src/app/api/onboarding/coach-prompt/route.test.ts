import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// auth ドメイン境界の adapter として getSession をモックする。実体は内部で
// Next.js の cookie store と JWT 公開鍵検証 (Cognito JWKS) を呼ぶため、実体を通すには
// それら全てをモックする必要があり、結局モック境界が同じ階層に下がるだけ。
// auth subsystem を 1 つの外部依存として扱う。
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));

/** session の有無を 1 行で切り替えるテストヘルパー。Arrange を 1 行に短縮する。 */
async function setSession(user: { userId: string; email: string } | null) {
	const { getSession } = await import("@/lib/auth/session");
	(getSession as ReturnType<typeof vi.fn>).mockResolvedValue(user);
}

describe("POST /api/onboarding/coach-prompt", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const { resetRateLimitStoreForTest } = await import(
			"@/lib/security/rate-limit"
		);
		resetRateLimitStoreForTest();
	});

	it("returns 401 when no session", async () => {
		await setSession(null);
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({ target_stage: "stats", profile_snapshot: {} }),
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
	});

	it("returns 400 on invalid body", async () => {
		await setSession({ userId: "u", email: "x" });
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({ target_stage: "unknown" }),
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	it("returns prompt on success", async () => {
		await setSession({ userId: "u", email: "x" });
		const { generateText } = await import("ai");
		(generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
			text: "Welcome.",
		});
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({
				target_stage: "stats",
				profile_snapshot: { age: 30 },
			}),
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.prompt).toBe("Welcome.");
		expect(body.cached).toBe(false);
	});

	it("returns 403 when origin is cross-site", async () => {
		await setSession({ userId: "u", email: "x" });
		const { generateText } = await import("ai");
		const { POST } = await import("./route");
		const req = {
			url: "http://app.example/api/onboarding/coach-prompt",
			headers: new Headers({
				origin: "http://evil.example",
				"sec-fetch-site": "cross-site",
			}),
			text: async () =>
				JSON.stringify({
					target_stage: "stats",
					profile_snapshot: { age: 30 },
				}),
		} as unknown as Request;

		const res = await POST(req);

		expect(res.status).toBe(403);
		expect(generateText).not.toHaveBeenCalled();
	});

	it("rate limits each authenticated user", async () => {
		await setSession({ userId: "limited-user", email: "x" });
		const { generateText } = await import("ai");
		(generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
			text: "Welcome.",
		});
		const { POST, COACH_PROMPT_RATE_LIMIT } = await import("./route");

		for (let i = 0; i < COACH_PROMPT_RATE_LIMIT.limit; i += 1) {
			const ok = await POST(
				new Request("http://x/api/onboarding/coach-prompt", {
					method: "POST",
					body: JSON.stringify({
						target_stage: "stats",
						profile_snapshot: { age: 30 },
					}),
				}),
			);
			expect(ok.status).toBe(200);
		}

		const blocked = await POST(
			new Request("http://x/api/onboarding/coach-prompt", {
				method: "POST",
				body: JSON.stringify({
					target_stage: "stats",
					profile_snapshot: { age: 30 },
				}),
			}),
		);
		expect(blocked.status).toBe(429);
	});

	it("returns a fallback prompt when Anthropic generation fails", async () => {
		await setSession({ userId: "u", email: "x" });
		const { generateText } = await import("ai");
		(generateText as ReturnType<typeof vi.fn>).mockRejectedValue(
			Object.assign(new Error("credit balance is too low"), {
				name: "AI_APICallError",
				statusCode: 400,
				responseHeaders: { "request-id": "req_123" },
				data: {
					type: "error",
					error: {
						type: "invalid_request_error",
						message:
							"Your credit balance is too low to access the Anthropic API.",
					},
				},
			}),
		);
		// LLM 失敗は graceful degrade (200 + cached: true) なので
		// 「業務エラー」ではなく「観測対象 warn」として記録される。
		// 旧実装は console.error だったが、4xx 相当の業務的フォールバックは
		// warn 級が適切なので test 側も合わせる。
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({
				target_stage: "stats",
				profile_snapshot: { age: 30 },
			}),
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.cached).toBe(true);
		expect(body.prompt).toContain("基本情報");
		expect(warnSpy).toHaveBeenCalledOnce();
		warnSpy.mockRestore();
	});
});

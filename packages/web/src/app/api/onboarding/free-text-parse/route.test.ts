import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// auth ドメイン境界の adapter として getSession をモックする。実体は内部で
// Next.js の cookie store と JWT 公開鍵検証 (Cognito JWKS) を呼ぶため、実体を通すには
// それら全てをモックする必要があり、結局モック境界が同じ階層に下がるだけ。
// auth subsystem を 1 つの外部依存として扱う。
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("ai", () => ({
	generateText: vi.fn(),
	Output: { object: vi.fn((opts) => opts) },
}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));

/** session の有無を 1 行で切り替えるテストヘルパー。Arrange を 1 行に短縮する。 */
async function setSession(user: { userId: string; email: string } | null) {
	const { getSession } = await import("@/lib/auth/session");
	(getSession as ReturnType<typeof vi.fn>).mockResolvedValue(user);
}

describe("POST /api/onboarding/free-text-parse", () => {
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
		const req = new Request("http://x/api/onboarding/free-text-parse", {
			method: "POST",
			body: JSON.stringify({
				stage: "lifestyle",
				free_text: "x",
				structured_snapshot: {},
			}),
		});
		expect((await POST(req)).status).toBe(401);
	});

	it("rejects stage=safety", async () => {
		await setSession({ userId: "u", email: "x" });
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/free-text-parse", {
			method: "POST",
			body: JSON.stringify({
				stage: "safety",
				free_text: "x",
				structured_snapshot: {},
			}),
		});
		expect((await POST(req)).status).toBe(400);
	});

	it("returns structured parse on success", async () => {
		await setSession({ userId: "u", email: "x" });
		const { generateText } = await import("ai");
		(generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
			experimental_output: {
				extracted_note: "summary",
				suggested_tags: ["tag1"],
			},
		});
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/free-text-parse", {
			method: "POST",
			body: JSON.stringify({
				stage: "preferences",
				free_text: "I like fish",
				structured_snapshot: {},
			}),
		});
		const res = await POST(req);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.note_field).toBe("preferences_note");
		expect(body.extracted_note).toBe("summary");
	});

	it("rejects oversized free text before calling the model", async () => {
		await setSession({ userId: "u", email: "x" });
		const { generateText } = await import("ai");
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/free-text-parse", {
			method: "POST",
			body: JSON.stringify({
				stage: "preferences",
				free_text: "x".repeat(2_001),
				structured_snapshot: {},
			}),
		});

		const res = await POST(req);

		expect(res.status).toBe(413);
		expect(generateText).not.toHaveBeenCalled();
	});

	it("rate limits each authenticated user", async () => {
		await setSession({ userId: "limited-user", email: "x" });
		const { generateText } = await import("ai");
		(generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
			experimental_output: {
				extracted_note: "summary",
				suggested_tags: ["tag1"],
			},
		});
		const { POST } = await import("./route");

		for (let i = 0; i < 20; i += 1) {
			const ok = await POST(
				new Request("http://x/api/onboarding/free-text-parse", {
					method: "POST",
					body: JSON.stringify({
						stage: "preferences",
						free_text: "I like fish",
						structured_snapshot: {},
					}),
				}),
			);
			expect(ok.status).toBe(200);
		}

		const blocked = await POST(
			new Request("http://x/api/onboarding/free-text-parse", {
				method: "POST",
				body: JSON.stringify({
					stage: "preferences",
					free_text: "I like fish",
					structured_snapshot: {},
				}),
			}),
		);
		expect(blocked.status).toBe(429);
	});
});

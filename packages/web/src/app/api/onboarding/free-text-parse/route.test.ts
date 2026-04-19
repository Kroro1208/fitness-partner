import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("ai", () => ({
	generateText: vi.fn(),
	Output: { object: vi.fn((opts) => opts) },
}));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));

describe("POST /api/onboarding/free-text-parse", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns 401 when no session", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
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
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
			userId: "u",
			email: "x",
		});
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
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
			userId: "u",
			email: "x",
		});
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
});

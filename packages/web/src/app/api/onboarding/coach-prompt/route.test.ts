import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: () => ({}) }));

describe("POST /api/onboarding/coach-prompt", () => {
	beforeEach(() => vi.clearAllMocks());

	it("returns 401 when no session", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({ target_stage: "stats", profile_snapshot: {} }),
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
	});

	it("returns 400 on invalid body", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
			userId: "u",
			email: "x",
		});
		const { POST } = await import("./route");
		const req = new Request("http://x/api/onboarding/coach-prompt", {
			method: "POST",
			body: JSON.stringify({ target_stage: "unknown" }),
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	it("returns prompt on success", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
			userId: "u",
			email: "x",
		});
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

	it("returns a fallback prompt when Anthropic generation fails", async () => {
		const { getSession } = await import("@/lib/auth/session");
		(getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
			userId: "u",
			email: "x",
		});
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
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
		expect(errorSpy).toHaveBeenCalledOnce();
		errorSpy.mockRestore();
	});
});

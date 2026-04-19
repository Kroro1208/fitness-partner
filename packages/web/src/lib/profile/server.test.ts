import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({
	getValidAccessTokenServer: vi.fn(),
}));

async function getValidAccessTokenServerMock() {
	const { getValidAccessTokenServer } = await import("../auth/session");
	return vi.mocked(getValidAccessTokenServer);
}

describe("getProfileServerSide", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.API_GATEWAY_URL = "https://api.example.com";
	});

	it("returns null when no access token", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue(null);
		const { getProfileServerSideResult } = await import("./server");
		const result = await getProfileServerSideResult();
		expect(result).toEqual({ ok: false, reason: "missing_access_token" });
	});

	it("returns profile on 200", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue("token");
		global.fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ profile: { onboarding_stage: "stats" } }),
					{ status: 200 },
				),
			);
		const { getProfileServerSide } = await import("./server");
		const result = await getProfileServerSide();
		expect(result?.onboardingStage).toBe("stats");
	});

	it("returns null on 404", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue("token");
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 404 }));
		const { getProfileServerSide } = await import("./server");
		const result = await getProfileServerSide();
		expect(result).toBeNull();
	});

	it("returns upstream failure details on non-404 error", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue("token");
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 503 }));
		const { getProfileServerSideResult } = await import("./server");
		const result = await getProfileServerSideResult();
		expect(result).toEqual({
			ok: false,
			reason: "upstream_failure",
			status: 503,
		});
	});
});

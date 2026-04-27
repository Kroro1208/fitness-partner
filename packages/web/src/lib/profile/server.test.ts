import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../auth/session", () => ({
	getValidAccessTokenServer: vi.fn(),
}));

// `redirect()` は内部で NEXT_REDIRECT を throw する Next.js 制御例外。
// vitest 環境では実際の navigation 機構が動かないため、ここでは
// テスト可観測な独自 marker を throw して識別する。
vi.mock("next/navigation", () => ({
	redirect: (path: string) => {
		const e = new Error(`__redirect__${path}`);
		e.name = "RedirectMock";
		throw e;
	},
}));

async function getValidAccessTokenServerMock() {
	const { getValidAccessTokenServer } = await import("../auth/session");
	return vi.mocked(getValidAccessTokenServer);
}

describe("getProfileServerSideResult / loadOnboardingProfile", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		process.env.API_GATEWAY_URL = "https://api.example.com";
	});

	it("missing_access_token を返す (Result 形)", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue(null);
		const { getProfileServerSideResult } = await import("./server");
		const result = await getProfileServerSideResult();
		expect(result).toEqual({ ok: false, reason: "missing_access_token" });
	});

	it("200 でプロフィールを返す", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue("token");
		global.fetch = vi
			.fn()
			.mockResolvedValue(
				new Response(
					JSON.stringify({ profile: { onboarding_stage: "stats" } }),
					{ status: 200 },
				),
			);
		const { loadOnboardingProfile } = await import("./server");
		const result = await loadOnboardingProfile();
		expect(result?.onboardingStage).toBe("stats");
	});

	it("404 で null を返す (=プロフィール未作成)", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue("token");
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 404 }));
		const { loadOnboardingProfile } = await import("./server");
		const result = await loadOnboardingProfile();
		expect(result).toBeNull();
	});

	it("upstream 503 は upstream_failure を返す (Result 形)", async () => {
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

	it("200 でも profile フィールド欠損は parse_failure", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue("token");
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
		const { getProfileServerSideResult } = await import("./server");
		const result = await getProfileServerSideResult();
		expect(result).toEqual({ ok: false, reason: "parse_failure" });
	});

	it("loadOnboardingProfile は missing_access_token で redirect('/signin')", async () => {
		// 旧実装は throw していたが、セッション切れは expected error なので
		// redirect で再ログイン誘導するのが正しい挙動。
		(await getValidAccessTokenServerMock()).mockResolvedValue(null);
		const { loadOnboardingProfile } = await import("./server");
		await expect(loadOnboardingProfile()).rejects.toThrow(
			/__redirect__\/signin/,
		);
	});

	it("loadOnboardingProfile は upstream_failure を throw する (= error.tsx 行き)", async () => {
		(await getValidAccessTokenServerMock()).mockResolvedValue("token");
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 503 }));
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { loadOnboardingProfile } = await import("./server");
		await expect(loadOnboardingProfile()).rejects.toThrow(
			/loadOnboardingProfile failed: upstream_failure/,
		);
		consoleError.mockRestore();
	});
});

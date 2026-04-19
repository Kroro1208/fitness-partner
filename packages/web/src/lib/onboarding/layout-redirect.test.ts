import { describe, expect, it } from "vitest";

import { resolveOnboardingLayoutRedirect } from "./layout-redirect";

describe("resolveOnboardingLayoutRedirect", () => {
	it("pathname が取れない場合は自己 redirect を避けて null を返す", () => {
		expect(
			resolveOnboardingLayoutRedirect({
				pathname: "",
				stage: "safety",
				pathStage: null,
			}),
		).toBeNull();
	});

	it("/onboarding エントリでは page.tsx に redirect を委ねる", () => {
		expect(
			resolveOnboardingLayoutRedirect({
				pathname: "/onboarding",
				stage: "stats",
				pathStage: null,
			}),
		).toBeNull();
	});

	it("blocked stage は blocked 以外から blocked へ寄せる", () => {
		expect(
			resolveOnboardingLayoutRedirect({
				pathname: "/onboarding/stats",
				stage: "blocked",
				pathStage: "stats",
			}),
		).toBe("/onboarding/blocked");
	});

	it("通常 stage は別の onboarding path からのみ正規 path へ redirect する", () => {
		expect(
			resolveOnboardingLayoutRedirect({
				pathname: "/onboarding/preferences",
				stage: "safety",
				pathStage: "preferences",
			}),
		).toBe("/onboarding/safety");
	});

	it("現在 path が stage と一致していれば redirect しない", () => {
		expect(
			resolveOnboardingLayoutRedirect({
				pathname: "/onboarding/safety",
				stage: "safety",
				pathStage: "safety",
			}),
		).toBeNull();
	});
});

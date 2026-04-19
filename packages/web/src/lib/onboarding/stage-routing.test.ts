import { describe, expect, it } from "vitest";
import {
	type OnboardingStage,
	pathForStage,
	resolveOnboardingStage,
	stageForPath,
} from "./stage-routing";

describe("pathForStage", () => {
	it("maps each stage to its URL", () => {
		const cases: Array<[OnboardingStage, string]> = [
			["safety", "/onboarding/safety"],
			["stats", "/onboarding/stats"],
			["lifestyle", "/onboarding/lifestyle"],
			["preferences", "/onboarding/preferences"],
			["snacks", "/onboarding/snacks"],
			["feasibility", "/onboarding/feasibility"],
			["review", "/onboarding/review"],
			["blocked", "/onboarding/blocked"],
		];
		for (const [stage, path] of cases) {
			expect(pathForStage(stage)).toBe(path);
		}
	});
});

describe("stageForPath", () => {
	it("extracts stage from pathname", () => {
		expect(stageForPath("/onboarding/stats")).toBe("stats");
		expect(stageForPath("/onboarding/review")).toBe("review");
	});
	it("returns null for non-onboarding paths", () => {
		expect(stageForPath("/home")).toBeNull();
		expect(stageForPath("/onboarding")).toBeNull();
	});
});

describe("resolveOnboardingStage", () => {
	it("returns known stages as-is", () => {
		expect(resolveOnboardingStage("review")).toBe("review");
		expect(resolveOnboardingStage("blocked")).toBe("blocked");
		expect(resolveOnboardingStage("complete")).toBe("complete");
	});

	it("falls back to safety for nullish values", () => {
		expect(resolveOnboardingStage(null)).toBe("safety");
		expect(resolveOnboardingStage(undefined)).toBe("safety");
	});
});

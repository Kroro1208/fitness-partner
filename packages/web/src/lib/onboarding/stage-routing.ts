const ONBOARDING_STAGES = [
	"safety",
	"stats",
	"lifestyle",
	"preferences",
	"snacks",
	"feasibility",
	"review",
	"blocked",
] as const;

export type OnboardingStage = (typeof ONBOARDING_STAGES)[number];

const STAGE_TO_PATH: Record<OnboardingStage, string> = {
	safety: "/onboarding/safety",
	stats: "/onboarding/stats",
	lifestyle: "/onboarding/lifestyle",
	preferences: "/onboarding/preferences",
	snacks: "/onboarding/snacks",
	feasibility: "/onboarding/feasibility",
	review: "/onboarding/review",
	blocked: "/onboarding/blocked",
};

export function pathForStage(stage: OnboardingStage): string {
	return STAGE_TO_PATH[stage];
}

export function resolveOnboardingStage(
	stage: OnboardingStage | "complete" | null | undefined,
): OnboardingStage | "complete" {
	switch (stage) {
		case "safety":
		case "stats":
		case "lifestyle":
		case "preferences":
		case "snacks":
		case "feasibility":
		case "review":
		case "blocked":
		case "complete":
			return stage;
		default:
			return "safety";
	}
}

export function stageForPath(pathname: string): OnboardingStage | null {
	for (const stage of ONBOARDING_STAGES) {
		const path = STAGE_TO_PATH[stage];
		if (pathname === path || pathname.startsWith(`${path}/`)) {
			return stage;
		}
	}

	return null;
}

export const ONBOARDING_STAGE_ORDER: readonly OnboardingStage[] = [
	"safety",
	"stats",
	"lifestyle",
	"preferences",
	"snacks",
	"feasibility",
	"review",
] as const;

export function nextStage(
	current: OnboardingStage,
): OnboardingStage | "complete" {
	const idx = ONBOARDING_STAGE_ORDER.indexOf(current);
	if (idx === -1 || current === "blocked") return current;
	if (idx === ONBOARDING_STAGE_ORDER.length - 1) return "complete";
	return ONBOARDING_STAGE_ORDER[idx + 1];
}

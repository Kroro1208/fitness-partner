import { type OnboardingStage, pathForStage } from "./stage-routing";

type ResolveOnboardingLayoutRedirectInput = {
	pathname: string;
	stage: OnboardingStage | "complete";
	pathStage: OnboardingStage | null;
};

export function resolveOnboardingLayoutRedirect({
	pathname,
	stage,
	pathStage,
}: ResolveOnboardingLayoutRedirectInput): string | null {
	if (stage === "complete") {
		return "/home";
	}

	if (pathname === "/onboarding") {
		return null;
	}

	// `x-next-pathname` が渡らない実行経路では現在パスを特定できない。
	// この状態で redirect を強制すると同一 URL への自己 redirect ループになりうるため、
	// パスが判定できる場合だけ整合性ガードを有効にする。
	if (pathStage === null) {
		return null;
	}

	if (stage === "blocked") {
		return pathStage === "blocked" ? null : "/onboarding/blocked";
	}

	if (stage === "review") {
		return null;
	}

	return pathStage === stage ? null : pathForStage(stage);
}

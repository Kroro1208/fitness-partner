import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileLoadFailure } from "@/components/domain/profile-load-failure";
import { getSession } from "@/lib/auth/session";
import {
	pathForStage,
	resolveOnboardingStage,
	stageForPath,
} from "@/lib/onboarding/stage-routing";
import { getProfileServerSideResult } from "@/lib/profile/server";

export default async function OnboardingLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (!session) redirect("/signin");

	const profileResult = await getProfileServerSideResult();
	if (!profileResult.ok) {
		return (
			<ProfileLoadFailure
				title="オンボーディングを開けませんでした"
				description="プロフィール取得に失敗したため、進行中ステージを判定できませんでした。"
			/>
		);
	}

	const profile = profileResult.profile;
	const stage = resolveOnboardingStage(profile?.onboardingStage);

	if (stage === "complete") redirect("/home");

	const pathname = (await headers()).get("x-next-pathname") ?? "";
	const pathStage = stageForPath(pathname);

	// /onboarding エントリは page.tsx が stage に応じた redirect を行う
	if (pathname === "/onboarding") {
		return <>{children}</>;
	}

	// blocked は /onboarding/blocked のみアクセス可
	if (stage === "blocked") {
		if (pathStage !== "blocked") redirect("/onboarding/blocked");
		return <>{children}</>;
	}

	// review stage は全セクション画面を編集目的で開ける
	// (各 Form が stage === "review" を見て「次へ」を review に戻す)
	if (stage === "review") {
		return <>{children}</>;
	}

	// それ以外: path の stage と profile.onboardingStage が一致しなければ強制 redirect
	if (pathStage !== stage) redirect(pathForStage(stage));

	return <>{children}</>;
}

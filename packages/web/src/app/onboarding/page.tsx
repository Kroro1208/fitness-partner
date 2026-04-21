import { redirect } from "next/navigation";

import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { ProfileLoadFailure } from "@/components/domain/profile-load-failure";
import {
	pathForStage,
	resolveOnboardingStage,
} from "@/lib/onboarding/stage-routing";
import { getProfileServerSideResult } from "@/lib/profile/server";

export const metadata = createOnboardingMetadata(
	"セットアップを再開",
	"AI Fitness Partner のオンボーディングを再開し、現在の進行状況に合わせて入力を続けます。",
);

export default async function OnboardingEntryPage() {
	const profileResult = await getProfileServerSideResult();
	if (!profileResult.ok) {
		return (
			<ProfileLoadFailure
				title="オンボーディングを開けませんでした"
				description="プロフィール取得に失敗したため、進行中ステージを判定できませんでした。"
			/>
		);
	}

	const stage = resolveOnboardingStage(profileResult.profile?.onboardingStage);
	if (stage === "complete") redirect("/home");
	if (stage === "blocked") redirect("/onboarding/blocked");
	redirect(pathForStage(stage));
}

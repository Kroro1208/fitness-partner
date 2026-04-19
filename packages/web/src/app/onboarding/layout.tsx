import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ProfileLoadFailure } from "@/components/domain/profile-load-failure";
import { getSession } from "@/lib/auth/session";
import { resolveOnboardingLayoutRedirect } from "@/lib/onboarding/layout-redirect";
import {
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

	const pathname = (await headers()).get("x-next-pathname") ?? "";
	const pathStage = stageForPath(pathname);

	const redirectPath = resolveOnboardingLayoutRedirect({
		pathname,
		stage,
		pathStage,
	});
	if (redirectPath !== null) {
		redirect(redirectPath);
	}

	return <>{children}</>;
}

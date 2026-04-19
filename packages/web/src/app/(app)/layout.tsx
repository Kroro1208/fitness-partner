import { redirect } from "next/navigation";

import { AppShell } from "@/components/domain/app-shell";
import { ProfileLoadFailure } from "@/components/domain/profile-load-failure";
import { getSession } from "@/lib/auth/session";
import { getProfileServerSideResult } from "@/lib/profile/server";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (!session) {
		redirect("/signin");
	}

	const profileResult = await getProfileServerSideResult();
	if (!profileResult.ok) {
		return (
			<ProfileLoadFailure
				title="アプリを開けませんでした"
				description="プロフィール取得に失敗したため、オンボーディングへの自動リダイレクトは行っていません。"
			/>
		);
	}

	if (profileResult.profile?.onboardingStage !== "complete") {
		redirect("/onboarding");
	}

	return <AppShell>{children}</AppShell>;
}

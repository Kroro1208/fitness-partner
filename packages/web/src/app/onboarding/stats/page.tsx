import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { loadOnboardingProfile } from "@/lib/profile/server";
import { StatsForm } from "./stats-form";

export const metadata = createOnboardingMetadata(
	"基本情報の入力",
	"年齢、体格、目標などプラン作成に必要な基本情報を入力します。",
);

export default async function StatsPage() {
	// セッション切れは loadOnboardingProfile 内で redirect("/signin")。
	const profile = await loadOnboardingProfile();

	return (
		<OnboardingShell stage="stats" backHref="/onboarding/safety">
			<StatsForm initialProfile={profile} />
		</OnboardingShell>
	);
}

import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { loadOnboardingProfile } from "@/lib/profile/server";
import { LifestyleForm } from "./lifestyle-form";

export const metadata = createOnboardingMetadata(
	"生活習慣の入力",
	"仕事、運動、睡眠、ストレスなど日常の生活習慣を入力します。",
);

export default async function LifestylePage() {
	// セッション切れは loadOnboardingProfile 内で redirect("/signin")。
	// そのほかの取得失敗 (config / upstream / parse) は throw して error.tsx へ。
	const profile = await loadOnboardingProfile();

	return (
		<OnboardingShell stage="lifestyle" backHref="/onboarding/stats">
			<LifestyleForm initialProfile={profile} />
		</OnboardingShell>
	);
}

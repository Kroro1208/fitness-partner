import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { getProfileServerSide } from "@/lib/profile/server";
import { LifestyleForm } from "./lifestyle-form";

export const metadata = createOnboardingMetadata(
	"生活習慣の入力",
	"仕事、運動、睡眠、ストレスなど日常の生活習慣を入力します。",
);

export default async function LifestylePage() {
	const profile = await getProfileServerSide();

	return (
		<OnboardingShell stage="lifestyle" backHref="/onboarding/stats">
			<LifestyleForm initialProfile={profile} />
		</OnboardingShell>
	);
}

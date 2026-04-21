import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { getProfileServerSide } from "@/lib/profile/server";
import { PreferencesForm } from "./preferences-form";

export const metadata = createOnboardingMetadata(
	"食事の好み",
	"好き嫌いや調理スタイルを入力し、好みに合う提案の精度を上げます。",
);

export default async function PreferencesPage() {
	const profile = await getProfileServerSide();

	return (
		<OnboardingShell stage="preferences" backHref="/onboarding/lifestyle">
			<PreferencesForm initialProfile={profile} />
		</OnboardingShell>
	);
}

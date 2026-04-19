import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { getProfileServerSide } from "@/lib/profile/server";
import { SnacksForm } from "./snacks-form";

export const metadata = createOnboardingMetadata(
	"間食の傾向",
	"間食の内容やタイミングを入力し、続けやすい改善案につなげます。",
);

export default async function SnacksPage() {
	const profile = await getProfileServerSide();

	return (
		<OnboardingShell stage="snacks" backHref="/onboarding/preferences">
			<SnacksForm initialProfile={profile} />
		</OnboardingShell>
	);
}

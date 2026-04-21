import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { getProfileServerSide } from "@/lib/profile/server";
import { SafetyForm } from "./safety-form";

export const metadata = createOnboardingMetadata(
	"健康状態の確認",
	"食事プラン提案の前提となる健康状態や注意事項を確認します。",
);

export default async function SafetyPage() {
	const profile = await getProfileServerSide();

	return (
		<OnboardingShell stage="safety">
			<SafetyForm initialProfile={profile} />
		</OnboardingShell>
	);
}

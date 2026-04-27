import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { loadOnboardingProfile } from "@/lib/profile/server";
import { FeasibilityForm } from "./feasibility-form";

export const metadata = createOnboardingMetadata(
	"実行しやすさの確認",
	"予算や食事回数、キッチン環境を入力し、現実的な提案条件を整えます。",
);

export default async function FeasibilityPage() {
	// loadOnboardingProfile はセッション切れなら redirect("/signin") を呼ぶ。
	// それ以外の取得失敗は throw して error.tsx に委譲する。
	const profile = await loadOnboardingProfile();

	return (
		<OnboardingShell stage="feasibility" backHref="/onboarding/snacks">
			<FeasibilityForm initialProfile={profile} />
		</OnboardingShell>
	);
}

import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { getProfileServerSide } from "@/lib/profile/server";
import { ReviewContent } from "./review-content";

export const metadata = createOnboardingMetadata(
	"入力内容の確認",
	"これまでに入力した健康状態や生活習慣を確認してオンボーディングを完了します。",
);

export default async function ReviewPage() {
	const profile = await getProfileServerSide();

	return (
		<OnboardingShell stage="review" backHref="/onboarding/feasibility">
			<ReviewContent initialProfile={profile} />
		</OnboardingShell>
	);
}

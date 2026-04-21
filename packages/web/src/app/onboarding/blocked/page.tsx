import { createOnboardingMetadata } from "@/app/onboarding/metadata";
import { BlockedNoticeCard } from "@/components/domain/blocked-notice-card";
import { OnboardingShell } from "@/components/domain/onboarding-shell";
import { ProfileLoadFailure } from "@/components/domain/profile-load-failure";
import { getProfileServerSideResult } from "@/lib/profile/server";

export const metadata = createOnboardingMetadata(
	"ご利用条件の確認",
	"現在の入力内容ではサポート対象外となる理由と案内を表示します。",
);

export default async function BlockedPage() {
	const profileResult = await getProfileServerSideResult();
	if (!profileResult.ok) {
		return (
			<ProfileLoadFailure
				title="ご利用条件の確認を開けませんでした"
				description="プロフィール取得に失敗したため、停止理由を表示できませんでした。"
			/>
		);
	}

	const profile = profileResult.profile;
	const reasons = (profile?.blockedReason ?? "")
		.split(";")
		.flatMap((reason) => {
			const trimmed = reason.trim();
			return trimmed ? [trimmed] : [];
		});

	return (
		<OnboardingShell stage="blocked">
			<BlockedNoticeCard reasons={reasons} />
		</OnboardingShell>
	);
}

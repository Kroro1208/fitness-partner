"use client";

import { useRouter } from "next/navigation";

import { SectionSummaryCard } from "@/components/domain/section-summary-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useGeneratePlan } from "@/hooks/use-plan";
import { weekStartOf } from "@/lib/date/week-start";
import { ONBOARDING_ERROR_MESSAGES } from "@/lib/onboarding/error-messages";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";

const PACE_LABELS: Record<"steady" | "aggressive", string> = {
	steady: "じっくり",
	aggressive: "早めに",
};

const JOB_TYPE_LABELS: Record<
	"desk" | "standing" | "light_physical" | "manual_labour" | "outdoor",
	string
> = {
	desk: "デスクワーク",
	standing: "立ち仕事",
	light_physical: "軽作業",
	manual_labour: "力仕事",
	outdoor: "屋外",
};

const STRESS_LABELS: Record<"low" | "moderate" | "high", string> = {
	low: "低め",
	moderate: "ふつう",
	high: "高め",
};

const COOKING_PREFERENCE_LABELS: Record<
	"scratch" | "quick" | "batch" | "mixed",
	string
> = {
	scratch: "手作り",
	quick: "時短",
	batch: "作り置き",
	mixed: "ミックス",
};

const SNACKING_REASON_LABELS: Record<
	"hunger" | "boredom" | "habit" | "mixed",
	string
> = {
	hunger: "空腹",
	boredom: "退屈",
	habit: "習慣",
	mixed: "ミックス",
};

const SNACK_TASTE_LABELS: Record<"sweet" | "savory" | "both", string> = {
	sweet: "甘い",
	savory: "しょっぱい",
	both: "両方",
};

const EATING_OUT_LABELS: Record<
	"mostly_home" | "mostly_eating_out" | "mixed",
	string
> = {
	mostly_home: "主に自炊",
	mostly_eating_out: "外食中心",
	mixed: "ミックス",
};

const BUDGET_LABELS: Record<"low" | "medium" | "high", string> = {
	low: "低め",
	medium: "標準",
	high: "高め",
};

const CONVENIENCE_STORE_LABELS: Record<"low" | "medium" | "high", string> = {
	low: "少ない",
	medium: "普通",
	high: "多い",
};

function yesNo(value: boolean | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	return value ? "はい" : "いいえ";
}

function joinOrNull(
	value: readonly string[] | null | undefined,
): string | null {
	if (!value || value.length === 0) return null;
	return value.join(", ");
}

export function ReviewContent({
	initialProfile,
}: {
	initialProfile: OnboardingProfile | null;
}) {
	const router = useRouter();
	const { profile, patch, isPatching, patchError } =
		useOnboarding(initialProfile);
	const generate = useGeneratePlan();

	// 完了は 2 段階の副作用 (profile を complete に PATCH → plan を生成):
	//   1. patch 成功 → generate 起動
	//   2. generate 成功 → /home へ
	//   3. generate 失敗 → /home?planError=1 へ (UI 側で固定文言を出す)
	//
	// 旧実装は `await mutateAsync` + try/catch で組んでおり、patch 失敗時の
	// catch が `return` だけの空 catch アンチパターンになっていた。
	// `mutate` + onSuccess / onError コールバックに置き換えると、失敗時は
	// React Query が `mutation.error` に保持し Alert を再描画するだけで済むため、
	// アプリコード側に空 catch を書く必要がない。
	const handleComplete = () => {
		patch({}, "complete", {
			onSuccess: () => {
				generate.mutate(
					{ weekStart: weekStartOf(new Date()) },
					{
						onSuccess: () => router.push("/home"),
						onError: (err) => {
							// generate 失敗は home 画面で fallback バナーを出す。
							// クエリパラメータでフラグするだけで、ユーザーは home の
							// PlanErrorBanner で「再生成」を試みる導線がある。
							console.warn("plan generation failed", {
								name: err instanceof Error ? err.name : "unknown",
								message: err instanceof Error ? err.message : String(err),
							});
							router.push("/home?planError=1");
						},
					},
				);
			},
		});
	};

	const completeButtonLabel = isPatching
		? "保存中..."
		: generate.isPending
			? "プランを作成中..."
			: "プランを作成する";

	const goal =
		profile?.goalWeightKg != null
			? `${profile.goalWeightKg} kg`
			: (profile?.goalDescription ?? null);

	const statsItems: Array<{ label: string; value: string | null }> = [
		{
			label: "年齢",
			value: profile?.age != null ? `${profile.age} 歳` : null,
		},
		{
			label: "身長",
			value: profile?.heightCm != null ? `${profile.heightCm} cm` : null,
		},
		{
			label: "体重",
			value: profile?.weightKg != null ? `${profile.weightKg} kg` : null,
		},
		{ label: "目標", value: goal },
		{
			label: "ペース",
			value: profile?.desiredPace ? PACE_LABELS[profile.desiredPace] : null,
		},
	];

	const lifestyleItems: Array<{ label: string; value: string | null }> = [
		{
			label: "職種",
			value: profile?.jobType ? JOB_TYPE_LABELS[profile.jobType] : null,
		},
		{
			label: "運動頻度",
			value:
				profile?.workoutsPerWeek != null
					? `${profile.workoutsPerWeek} 回/週`
					: null,
		},
		{
			label: "睡眠",
			value: profile?.sleepHours != null ? `${profile.sleepHours} 時間` : null,
		},
		{
			label: "ストレス",
			value: profile?.stressLevel ? STRESS_LABELS[profile.stressLevel] : null,
		},
	];

	const preferencesItems: Array<{ label: string; value: string | null }> = [
		{ label: "好きな食事", value: joinOrNull(profile?.favoriteMeals) },
		{ label: "苦手", value: joinOrNull(profile?.hatedFoods) },
		{
			label: "調理",
			value: profile?.cookingPreference
				? COOKING_PREFERENCE_LABELS[profile.cookingPreference]
				: null,
		},
	];

	const snacksItems: Array<{ label: string; value: string | null }> = [
		{ label: "普段の間食", value: joinOrNull(profile?.currentSnacks) },
		{
			label: "きっかけ",
			value: profile?.snackingReason
				? SNACKING_REASON_LABELS[profile.snackingReason]
				: null,
		},
		{
			label: "味の好み",
			value: profile?.snackTastePreference
				? SNACK_TASTE_LABELS[profile.snackTastePreference]
				: null,
		},
		{ label: "夜遅い間食", value: yesNo(profile?.lateNightSnacking) },
	];

	const feasibilityItems: Array<{ label: string; value: string | null }> = [
		{
			label: "外食スタイル",
			value: profile?.eatingOutStyle
				? EATING_OUT_LABELS[profile.eatingOutStyle]
				: null,
		},
		{
			label: "予算",
			value: profile?.budgetLevel ? BUDGET_LABELS[profile.budgetLevel] : null,
		},
		{
			label: "食事回数",
			value:
				profile?.mealFrequencyPreference != null
					? `${profile.mealFrequencyPreference} 回/日`
					: null,
		},
		{ label: "地域", value: profile?.locationRegion ?? null },
		{
			label: "コンビニ利用",
			value: profile?.convenienceStoreUsage
				? CONVENIENCE_STORE_LABELS[profile.convenienceStoreUsage]
				: null,
		},
	];

	// 持病は入力値を尊重する。未入力を「無」と断定しない:
	// isUnderTreatment が明示的に false のときだけ「無し」と表示し、それ以外 (null
	// = 未入力 / true) は入力テキストをそのまま、無ければ null (未設定表示) にする。
	const medicalConditionValue: string | null =
		profile?.medicalConditionNote ??
		(profile?.isUnderTreatment === false ? "無し" : null);

	const safetyItems: Array<{ label: string; value: string | null }> = [
		{ label: "通院中", value: yesNo(profile?.isUnderTreatment) },
		{ label: "服薬中", value: yesNo(profile?.onMedication) },
		{ label: "持病", value: medicalConditionValue },
	];

	return (
		<div className="space-y-4">
			<SectionSummaryCard
				title="身体・目標"
				editHref="/onboarding/stats"
				items={statsItems}
			/>
			<SectionSummaryCard
				title="ライフスタイル"
				editHref="/onboarding/lifestyle"
				items={lifestyleItems}
			/>
			<SectionSummaryCard
				title="食事の好み"
				editHref="/onboarding/preferences"
				items={preferencesItems}
			/>
			<SectionSummaryCard
				title="間食"
				editHref="/onboarding/snacks"
				items={snacksItems}
			/>
			<SectionSummaryCard
				title="実行可能性"
				editHref="/onboarding/feasibility"
				items={feasibilityItems}
			/>
			<SectionSummaryCard
				title="健康状態"
				editHref="/onboarding/safety"
				items={safetyItems}
			/>

			{patchError && (
				<Alert className="border-danger-500 bg-danger-100">
					<AlertDescription>
						{ONBOARDING_ERROR_MESSAGES.patchFailed}
					</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-end pt-2">
				<Button
					onClick={handleComplete}
					disabled={isPatching || generate.isPending}
				>
					{completeButtonLabel}
				</Button>
			</div>
		</div>
	);
}

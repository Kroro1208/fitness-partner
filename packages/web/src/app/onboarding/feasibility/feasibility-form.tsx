"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useReducer } from "react";

import { ChoiceChips } from "@/components/domain/choice-chips";
import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Stepper } from "@/components/domain/stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { coachPromptQueryOptions, useOnboarding } from "@/hooks/use-onboarding";
import { buildAdvancePlan } from "@/lib/onboarding/submission-plans";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";
import { trimmedOrNull } from "@/lib/utils";

type EatingOutStyle = "mostly_home" | "mostly_eating_out" | "mixed";
type BudgetLevel = "low" | "medium" | "high";
type ConvenienceStoreUsage = "low" | "medium" | "high";
type FeasibilityState = {
	eatingOutStyle: EatingOutStyle | null;
	budgetLevel: BudgetLevel | null;
	mealFrequencyPreference: number;
	locationRegion: string;
	kitchenAccess: string;
	convenienceStoreUsage: ConvenienceStoreUsage | null;
};
type FeasibilityAction = { type: "patch"; patch: Partial<FeasibilityState> };

function feasibilityReducer(
	state: FeasibilityState,
	action: FeasibilityAction,
): FeasibilityState {
	switch (action.type) {
		case "patch":
			return { ...state, ...action.patch };
	}
}

export function FeasibilityForm({
	initialProfile,
}: {
	initialProfile: OnboardingProfile | null;
}) {
	const router = useRouter();
	const { profile, patch, prefetchCoachPrompt, isPatching, patchError } =
		useOnboarding(initialProfile);

	const [state, dispatch] = useReducer(feasibilityReducer, {
		eatingOutStyle: profile?.eatingOutStyle ?? null,
		budgetLevel: profile?.budgetLevel ?? null,
		mealFrequencyPreference: profile?.mealFrequencyPreference ?? 3,
		locationRegion: profile?.locationRegion ?? "",
		kitchenAccess: profile?.kitchenAccess ?? "",
		convenienceStoreUsage: profile?.convenienceStoreUsage ?? null,
	});
	const {
		eatingOutStyle,
		budgetLevel,
		mealFrequencyPreference,
		locationRegion,
		kitchenAccess,
		convenienceStoreUsage,
	} = state;
	const updateState = (patch: Partial<FeasibilityState>) =>
		dispatch({ type: "patch", patch });

	const coach = useQuery(coachPromptQueryOptions("feasibility", profile ?? {}));

	const canProceed =
		eatingOutStyle !== null &&
		budgetLevel !== null &&
		convenienceStoreUsage !== null;

	const handleNext = async () => {
		const basePatch = {
			eatingOutStyle,
			budgetLevel,
			mealFrequencyPreference,
			locationRegion: trimmedOrNull(locationRegion),
			kitchenAccess: trimmedOrNull(kitchenAccess),
			convenienceStoreUsage,
		};
		const plan = buildAdvancePlan({
			profile,
			basePatch,
			fallbackNextStage: "review",
		});
		prefetchCoachPrompt(
			plan.coachPromptPrefetch.targetStage,
			plan.coachPromptPrefetch.snapshot,
		);
		await patch(plan.basePatch, plan.nextStage);
		router.push(plan.redirectPath);
	};

	return (
		<div className="space-y-6">
			<CoachPromptCard
				prompt={coach.data?.prompt ?? null}
				isLoading={coach.isLoading}
				isFallback={coach.data?.cached ?? false}
				isUnavailable={coach.isError}
			/>

			<div className="space-y-2">
				<Label>外食スタイル</Label>
				<SegmentedControl
					value={eatingOutStyle}
					onChange={(value) => updateState({ eatingOutStyle: value })}
					options={[
						{ value: "mostly_home", label: "主に自炊" },
						{ value: "mostly_eating_out", label: "外食中心" },
						{ value: "mixed", label: "ミックス" },
					]}
					ariaLabel="外食スタイル"
				/>
			</div>

			<div className="space-y-2">
				<Label>予算感</Label>
				<ChoiceChips
					value={budgetLevel}
					onChange={(value) => updateState({ budgetLevel: value })}
					options={[
						{ value: "low", label: "低め" },
						{ value: "medium", label: "標準" },
						{ value: "high", label: "高め" },
					]}
					ariaLabel="予算感"
				/>
			</div>

			<div className="space-y-2">
				<Label>1日の食事回数</Label>
				<Stepper
					value={mealFrequencyPreference}
					onChange={(value) => updateState({ mealFrequencyPreference: value })}
					min={1}
					max={6}
					ariaLabel="1日の食事回数"
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="location-region">地域 (任意)</Label>
				<Input
					id="location-region"
					value={locationRegion}
					onChange={(e) => updateState({ locationRegion: e.target.value })}
					placeholder="都道府県/市区町村"
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="kitchen-access">キッチン環境 (任意)</Label>
				<Textarea
					id="kitchen-access"
					value={kitchenAccess}
					onChange={(e) => updateState({ kitchenAccess: e.target.value })}
					placeholder="キッチン環境（ガスコンロ/IH/冷凍庫容量 など）"
				/>
			</div>

			<div className="space-y-2">
				<Label>コンビニ利用頻度</Label>
				<SegmentedControl
					value={convenienceStoreUsage}
					onChange={(value) => updateState({ convenienceStoreUsage: value })}
					options={[
						{ value: "low", label: "少ない" },
						{ value: "medium", label: "普通" },
						{ value: "high", label: "多い" },
					]}
					ariaLabel="コンビニ利用頻度"
				/>
			</div>

			{patchError && (
				<Alert className="border-danger-500 bg-danger-100">
					<AlertDescription>保存に失敗しました。</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-end">
				<Button onClick={handleNext} disabled={!canProceed || isPatching}>
					{isPatching ? "保存中..." : "次へ"}
				</Button>
			</div>
		</div>
	);
}

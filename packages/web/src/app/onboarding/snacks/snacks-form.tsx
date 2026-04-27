"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";

import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { MultiTagInput } from "@/components/domain/multi-tag-input";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { coachPromptQueryOptions, useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_ERROR_MESSAGES } from "@/lib/onboarding/error-messages";
import { buildAdvancePlan } from "@/lib/onboarding/submission-plans";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";

type SnackingReason = "hunger" | "boredom" | "habit" | "mixed";
type SnackTaste = "sweet" | "savory" | "both";
type YesNo = "yes" | "no";
type SnacksState = {
	currentSnacks: string[];
	snackingReason: SnackingReason | null;
	snackTastePreference: SnackTaste | null;
	lateNightSnacking: YesNo | null;
	freeText: string;
};
type SnacksAction = { type: "patch"; patch: Partial<SnacksState> };

function snacksReducer(state: SnacksState, action: SnacksAction): SnacksState {
	switch (action.type) {
		case "patch":
			return { ...state, ...action.patch };
	}
}

function toLateNightSnackingValue(
	value: OnboardingProfile["lateNightSnacking"],
): YesNo | null {
	if (value === null || value === undefined) return null;
	return value ? "yes" : "no";
}

function buildSnacksAdvancePlan(input: {
	profile: OnboardingProfile | null;
	state: SnacksState;
	returnToReview: boolean;
}) {
	const { profile, state, returnToReview } = input;
	const basePatch = {
		currentSnacks: state.currentSnacks,
		snackingReason: state.snackingReason,
		snackTastePreference: state.snackTastePreference,
		lateNightSnacking:
			state.lateNightSnacking === null
				? null
				: state.lateNightSnacking === "yes",
	};

	return buildAdvancePlan({
		profile,
		basePatch,
		fallbackNextStage: "feasibility",
		returnToReview,
		freeText: { stage: "snacks", value: state.freeText },
	});
}

export function SnacksForm({
	initialProfile,
}: {
	initialProfile: OnboardingProfile | null;
}) {
	const router = useRouter();
	const {
		profile,
		patch,
		prefetchCoachPrompt,
		parseFreeText,
		isPatching,
		patchError,
	} = useOnboarding(initialProfile);
	const returnToReview = profile?.onboardingStage === "review";
	const [freeTextParseError, setFreeTextParseError] = useState<string | null>(
		null,
	);

	const [state, dispatch] = useReducer(snacksReducer, {
		currentSnacks: profile?.currentSnacks ?? [],
		snackingReason: profile?.snackingReason ?? null,
		snackTastePreference: profile?.snackTastePreference ?? null,
		lateNightSnacking: toLateNightSnackingValue(profile?.lateNightSnacking),
		freeText: "",
	});
	const {
		currentSnacks,
		snackingReason,
		snackTastePreference,
		lateNightSnacking,
		freeText,
	} = state;
	const updateState = (patch: Partial<SnacksState>) =>
		dispatch({ type: "patch", patch });

	const coach = useQuery(coachPromptQueryOptions("snacks", profile ?? {}));

	const canProceed =
		snackingReason !== null &&
		snackTastePreference !== null &&
		lateNightSnacking !== null;

	const handleNext = async () => {
		setFreeTextParseError(null);
		const plan = buildSnacksAdvancePlan({
			profile,
			state,
			returnToReview,
		});
		if (plan.freeTextParse !== null) {
			const parseResult = await parseFreeText(
				plan.freeTextParse.stage,
				plan.freeTextParse.freeText,
				plan.freeTextParse.snapshot,
			);
			if (!parseResult.ok) {
				setFreeTextParseError(ONBOARDING_ERROR_MESSAGES.freeTextParseFailed);
				return;
			}
		}
		prefetchCoachPrompt(
			plan.coachPromptPrefetch.targetStage,
			plan.coachPromptPrefetch.snapshot,
		);
		// patch は mutate ベース。失敗時は mutation.error → patchError Alert で表示。
		// 成功時のみ onSuccess で遷移する。
		patch(plan.basePatch, plan.nextStage, {
			onSuccess: () => router.push(plan.redirectPath),
		});
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
				<Label>普段の間食</Label>
				<MultiTagInput
					value={currentSnacks}
					onChange={(value) => updateState({ currentSnacks: value })}
					placeholder="よく食べる間食"
					ariaLabel="普段の間食"
				/>
			</div>

			<div className="space-y-2">
				<Label>間食のきっかけ</Label>
				<SegmentedControl
					value={snackingReason}
					onChange={(value) => updateState({ snackingReason: value })}
					options={[
						{ value: "hunger", label: "空腹" },
						{ value: "boredom", label: "退屈" },
						{ value: "habit", label: "習慣" },
						{ value: "mixed", label: "ミックス" },
					]}
					ariaLabel="間食のきっかけ"
				/>
			</div>

			<div className="space-y-2">
				<Label>味の好み</Label>
				<SegmentedControl
					value={snackTastePreference}
					onChange={(value) => updateState({ snackTastePreference: value })}
					options={[
						{ value: "sweet", label: "甘い" },
						{ value: "savory", label: "しょっぱい" },
						{ value: "both", label: "両方" },
					]}
					ariaLabel="味の好み"
				/>
			</div>

			<div className="space-y-2">
				<Label>夜遅い時間の間食はありますか</Label>
				<SegmentedControl
					value={lateNightSnacking}
					onChange={(value) => updateState({ lateNightSnacking: value })}
					options={[
						{ value: "yes", label: "はい" },
						{ value: "no", label: "いいえ" },
					]}
					ariaLabel="夜遅い時間の間食"
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="snacks-note">自由記述 (任意)</Label>
				<Textarea
					id="snacks-note"
					value={freeText}
					onChange={(e) => updateState({ freeText: e.target.value })}
					placeholder="間食について他に気になること"
				/>
			</div>

			{patchError && (
				<Alert className="border-danger-500 bg-danger-100">
					<AlertDescription>
						{ONBOARDING_ERROR_MESSAGES.patchFailed}
					</AlertDescription>
				</Alert>
			)}
			{freeTextParseError && (
				<Alert className="border-danger-500 bg-danger-100">
					<AlertDescription>{freeTextParseError}</AlertDescription>
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

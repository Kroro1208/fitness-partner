"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useReducer } from "react";

import { ChoiceChips } from "@/components/domain/choice-chips";
import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { MultiTagInput } from "@/components/domain/multi-tag-input";
import { NumberField } from "@/components/domain/number-field";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Stepper } from "@/components/domain/stepper";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { coachPromptQueryOptions, useOnboarding } from "@/hooks/use-onboarding";
import { buildAdvancePlan } from "@/lib/onboarding/submission-plans";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";
import { trimmedOrNull } from "@/lib/utils";

type JobType =
	| "desk"
	| "standing"
	| "light_physical"
	| "manual_labour"
	| "outdoor";
type StressLevel = "low" | "moderate" | "high";
type LifestyleState = {
	jobType: JobType | null;
	workoutsPerWeek: number;
	workoutTypes: string[];
	sleepHours: number | null;
	stressLevel: StressLevel | null;
	alcoholPerWeek: string;
	freeText: string;
};
type LifestyleAction = { type: "patch"; patch: Partial<LifestyleState> };

function lifestyleReducer(
	state: LifestyleState,
	action: LifestyleAction,
): LifestyleState {
	switch (action.type) {
		case "patch":
			return { ...state, ...action.patch };
	}
}

export function LifestyleForm({
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

	const [state, dispatch] = useReducer(lifestyleReducer, {
		jobType: profile?.jobType ?? null,
		workoutsPerWeek: profile?.workoutsPerWeek ?? 0,
		workoutTypes: profile?.workoutTypes ?? [],
		sleepHours: profile?.sleepHours ?? null,
		stressLevel: profile?.stressLevel ?? null,
		alcoholPerWeek: profile?.alcoholPerWeek ?? "",
		freeText: "",
	});
	const {
		jobType,
		workoutsPerWeek,
		workoutTypes,
		sleepHours,
		stressLevel,
		alcoholPerWeek,
		freeText,
	} = state;
	const updateState = (patch: Partial<LifestyleState>) =>
		dispatch({ type: "patch", patch });

	const coach = useQuery(coachPromptQueryOptions("lifestyle", profile ?? {}));

	const canProceed =
		jobType !== null && sleepHours !== null && stressLevel !== null;

	const handleNext = async () => {
		const basePatch = {
			jobType,
			workoutsPerWeek,
			workoutTypes,
			sleepHours,
			stressLevel,
			alcoholPerWeek: trimmedOrNull(alcoholPerWeek),
		};
		const plan = buildAdvancePlan({
			profile,
			basePatch,
			fallbackNextStage: "preferences",
			returnToReview,
			freeText: { stage: "lifestyle", value: freeText },
		});
		if (plan.freeTextParse !== null) {
			parseFreeText(
				plan.freeTextParse.stage,
				plan.freeTextParse.freeText,
				plan.freeTextParse.snapshot,
			);
		}
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
			/>

			<div className="space-y-2">
				<Label>職種</Label>
				<ChoiceChips
					value={jobType}
					onChange={(value) => updateState({ jobType: value })}
					options={[
						{ value: "desk", label: "デスクワーク" },
						{ value: "standing", label: "立ち仕事" },
						{ value: "light_physical", label: "軽作業" },
						{ value: "manual_labour", label: "力仕事" },
						{ value: "outdoor", label: "屋外" },
					]}
					ariaLabel="職種"
				/>
			</div>

			<div className="space-y-2">
				<Label>運動頻度 (週)</Label>
				<Stepper
					value={workoutsPerWeek}
					onChange={(value) => updateState({ workoutsPerWeek: value })}
					min={0}
					max={14}
					ariaLabel="運動頻度"
				/>
			</div>

			<div className="space-y-2">
				<Label>運動の種類</Label>
				<MultiTagInput
					value={workoutTypes}
					onChange={(value) => updateState({ workoutTypes: value })}
					placeholder="ランニング、筋トレ など"
					ariaLabel="運動の種類"
				/>
			</div>

			<NumberField
				id="sleep-hours"
				label="睡眠時間"
				unit="時間"
				value={sleepHours}
				onChange={(value) => updateState({ sleepHours: value })}
				min={0}
				max={24}
				step={0.5}
			/>

			<div className="space-y-2">
				<Label>ストレスレベル</Label>
				<SegmentedControl
					value={stressLevel}
					onChange={(value) => updateState({ stressLevel: value })}
					options={[
						{ value: "low", label: "低め" },
						{ value: "moderate", label: "ふつう" },
						{ value: "high", label: "高め" },
					]}
					ariaLabel="ストレスレベル"
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="alcohol">飲酒頻度・量 (任意)</Label>
				<Textarea
					id="alcohol"
					value={alcoholPerWeek}
					onChange={(e) => updateState({ alcoholPerWeek: e.target.value })}
					placeholder="週に2回ビール1杯 など"
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="lifestyle-note">自由記述 (任意)</Label>
				<Textarea
					id="lifestyle-note"
					value={freeText}
					onChange={(e) => updateState({ freeText: e.target.value })}
					placeholder="その他、生活リズムで気になることがあれば自由にどうぞ"
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

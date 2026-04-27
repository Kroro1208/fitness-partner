"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useReducer } from "react";

import { ChoiceChips } from "@/components/domain/choice-chips";
import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { NumberField } from "@/components/domain/number-field";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { coachPromptQueryOptions, useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_ERROR_MESSAGES } from "@/lib/onboarding/error-messages";
import { buildAdvancePlan } from "@/lib/onboarding/submission-plans";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";

type StatsState = {
	age: number | null;
	sex: "male" | "female" | null;
	heightCm: number | null;
	weightKg: number | null;
	goalMode: "weight" | "description";
	goalWeightKg: number | null;
	goalDescription: string;
	pace: "steady" | "aggressive" | null;
};
type StatsAction = { type: "patch"; patch: Partial<StatsState> };

function statsReducer(state: StatsState, action: StatsAction): StatsState {
	return { ...state, ...action.patch };
}

function buildStatsAdvancePlan(input: {
	profile: OnboardingProfile | null;
	state: StatsState;
	returnToReview: boolean;
}) {
	const { profile, state, returnToReview } = input;
	const basePatch = {
		age: state.age,
		sex: state.sex,
		heightCm: state.heightCm,
		weightKg: state.weightKg,
		desiredPace: state.pace,
		goalWeightKg: state.goalMode === "weight" ? state.goalWeightKg : null,
		goalDescription:
			state.goalMode === "description" ? state.goalDescription : null,
	};

	return buildAdvancePlan({
		profile,
		basePatch,
		fallbackNextStage: "lifestyle",
		returnToReview,
	});
}

export function StatsForm({
	initialProfile,
}: {
	initialProfile: OnboardingProfile | null;
}) {
	const router = useRouter();
	const { profile, patch, prefetchCoachPrompt, isPatching, patchError } =
		useOnboarding(initialProfile);
	const returnToReview = profile?.onboardingStage === "review";

	const [state, dispatch] = useReducer(statsReducer, {
		age: profile?.age ?? null,
		sex: profile?.sex ?? null,
		heightCm: profile?.heightCm ?? null,
		weightKg: profile?.weightKg ?? null,
		goalMode: profile?.goalDescription ? "description" : "weight",
		goalWeightKg: profile?.goalWeightKg ?? null,
		goalDescription: profile?.goalDescription ?? "",
		pace: profile?.desiredPace ?? null,
	});
	const {
		age,
		sex,
		heightCm,
		weightKg,
		goalMode,
		goalWeightKg,
		goalDescription,
		pace,
	} = state;
	const updateState = (patch: Partial<StatsState>) =>
		dispatch({ type: "patch", patch });

	const coach = useQuery(coachPromptQueryOptions("stats", profile ?? {}));

	const canProceed =
		age !== null &&
		sex !== null &&
		heightCm !== null &&
		weightKg !== null &&
		pace !== null &&
		(goalMode === "weight"
			? goalWeightKg !== null
			: goalDescription.trim().length > 0);

	const handleNext = async () => {
		const plan = buildStatsAdvancePlan({
			profile,
			state,
			returnToReview,
		});
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

			<NumberField
				id="age"
				label="年齢"
				unit="歳"
				value={age}
				onChange={(value) => updateState({ age: value })}
				min={18}
				max={120}
			/>

			<div className="space-y-2">
				<Label>性別</Label>
				<ChoiceChips
					value={sex}
					onChange={(value) => updateState({ sex: value })}
					options={[
						{ value: "male", label: "男性" },
						{ value: "female", label: "女性" },
					]}
					ariaLabel="性別"
				/>
			</div>

			<NumberField
				id="height"
				label="身長"
				unit="cm"
				value={heightCm}
				onChange={(value) => updateState({ heightCm: value })}
				min={100}
				max={250}
				step={0.1}
			/>
			<NumberField
				id="weight"
				label="現在の体重"
				unit="kg"
				value={weightKg}
				onChange={(value) => updateState({ weightKg: value })}
				min={20}
				max={300}
				step={0.1}
			/>

			<div className="space-y-3">
				<Label>目標の決め方</Label>
				<SegmentedControl
					value={goalMode}
					onChange={(value) => updateState({ goalMode: value })}
					options={[
						{ value: "weight", label: "目標体重" },
						{ value: "description", label: "見た目・体感" },
					]}
					ariaLabel="目標の種類"
				/>
				<p className="text-sm text-neutral-500">
					目標はどちらか 1 つ選びます。体重で決めたい場合は「目標体重」、
					数字以外の変化を目指す場合は「見た目・体感」を選んでください。
				</p>
				{goalMode === "weight" ? (
					<NumberField
						id="goal-weight"
						label="目標体重"
						unit="kg"
						value={goalWeightKg}
						onChange={(value) => updateState({ goalWeightKg: value })}
						min={20}
						max={300}
						step={0.1}
					/>
				) : (
					<Textarea
						placeholder="例: お腹まわりをすっきりさせたい、階段で息切れしにくくなりたい"
						value={goalDescription}
						onChange={(e) => updateState({ goalDescription: e.target.value })}
					/>
				)}
			</div>

			<div className="space-y-2">
				<Label>ペース</Label>
				<SegmentedControl
					value={pace}
					onChange={(value) => updateState({ pace: value })}
					options={[
						{ value: "steady", label: "じっくり" },
						{ value: "aggressive", label: "早めに" },
					]}
					ariaLabel="減量ペース"
				/>
			</div>

			{patchError && (
				<Alert className="border-danger-500 bg-danger-100 text-danger-700">
					<AlertDescription className="text-danger-700">
						{ONBOARDING_ERROR_MESSAGES.patchFailed}
					</AlertDescription>
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

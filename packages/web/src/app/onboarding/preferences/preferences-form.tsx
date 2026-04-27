"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";

import { ChoiceChips } from "@/components/domain/choice-chips";
import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { MultiTagInput } from "@/components/domain/multi-tag-input";
import { SliderField } from "@/components/domain/slider-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { coachPromptQueryOptions, useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_ERROR_MESSAGES } from "@/lib/onboarding/error-messages";
import { buildAdvancePlan } from "@/lib/onboarding/submission-plans";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";

type CookingPreference = "scratch" | "quick" | "batch" | "mixed";
type PreferencesState = {
	favoriteMeals: string[];
	hatedFoods: string[];
	restrictions: string[];
	cookingPreference: CookingPreference | null;
	foodAdventurousness: number;
	freeText: string;
};
type PreferencesAction = { type: "patch"; patch: Partial<PreferencesState> };

function preferencesReducer(
	state: PreferencesState,
	action: PreferencesAction,
): PreferencesState {
	switch (action.type) {
		case "patch":
			return { ...state, ...action.patch };
	}
}

type FavoriteMeals = OnboardingProfile["favoriteMeals"];

function toFavoriteMeals(items: string[]): FavoriteMeals {
	const trimmed = items.slice(0, 5);
	switch (trimmed.length) {
		case 0:
			return [];
		case 1:
			return [trimmed[0]];
		case 2:
			return [trimmed[0], trimmed[1]];
		case 3:
			return [trimmed[0], trimmed[1], trimmed[2]];
		case 4:
			return [trimmed[0], trimmed[1], trimmed[2], trimmed[3]];
		default:
			return [trimmed[0], trimmed[1], trimmed[2], trimmed[3], trimmed[4]];
	}
}

function buildPreferencesAdvancePlan(input: {
	profile: OnboardingProfile | null;
	state: PreferencesState;
	returnToReview: boolean;
}) {
	const { profile, state, returnToReview } = input;
	const basePatch: Partial<OnboardingProfile> = {
		favoriteMeals: toFavoriteMeals(state.favoriteMeals),
		hatedFoods: state.hatedFoods,
		restrictions: state.restrictions,
		cookingPreference: state.cookingPreference,
		foodAdventurousness: state.foodAdventurousness,
	};

	return buildAdvancePlan({
		profile,
		basePatch,
		fallbackNextStage: "snacks",
		returnToReview,
		freeText: { stage: "preferences", value: state.freeText },
	});
}

export function PreferencesForm({
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

	const [state, dispatch] = useReducer(preferencesReducer, {
		favoriteMeals: profile?.favoriteMeals ? [...profile.favoriteMeals] : [],
		hatedFoods: profile?.hatedFoods ?? [],
		restrictions: profile?.restrictions ?? [],
		cookingPreference: profile?.cookingPreference ?? null,
		foodAdventurousness: profile?.foodAdventurousness ?? 5,
		freeText: "",
	});
	const {
		favoriteMeals,
		hatedFoods,
		restrictions,
		cookingPreference,
		foodAdventurousness,
		freeText,
	} = state;
	const updateState = (patch: Partial<PreferencesState>) =>
		dispatch({ type: "patch", patch });

	const coach = useQuery(coachPromptQueryOptions("preferences", profile ?? {}));

	const canProceed = cookingPreference !== null;

	const handleNext = async () => {
		setFreeTextParseError(null);
		const plan = buildPreferencesAdvancePlan({
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
				<Label>好きな食事・食材</Label>
				<MultiTagInput
					value={favoriteMeals}
					onChange={(value) => updateState({ favoriteMeals: value })}
					placeholder="好きな食事/食材 (最大5つ)"
					max={5}
					ariaLabel="好きな食事・食材"
				/>
			</div>

			<div className="space-y-2">
				<Label>苦手な食べ物</Label>
				<MultiTagInput
					value={hatedFoods}
					onChange={(value) => updateState({ hatedFoods: value })}
					placeholder="苦手な食べ物"
					ariaLabel="苦手な食べ物"
				/>
			</div>

			<div className="space-y-2">
				<Label>アレルギー・制限</Label>
				<MultiTagInput
					value={restrictions}
					onChange={(value) => updateState({ restrictions: value })}
					placeholder="アレルギー / 宗教上の制限 など"
					ariaLabel="アレルギー・制限"
				/>
			</div>

			<div className="space-y-2">
				<Label>調理スタイル</Label>
				<ChoiceChips
					value={cookingPreference}
					onChange={(value) => updateState({ cookingPreference: value })}
					options={[
						{ value: "scratch", label: "手作り" },
						{ value: "quick", label: "時短" },
						{ value: "batch", label: "作り置き" },
						{ value: "mixed", label: "ミックス" },
					]}
					ariaLabel="調理スタイル"
				/>
			</div>

			<SliderField
				id="food-adventurousness"
				label="新しい食べ物への挑戦度"
				value={foodAdventurousness}
				onChange={(value) => updateState({ foodAdventurousness: value })}
				min={1}
				max={10}
			/>

			<div className="space-y-2">
				<Label htmlFor="preferences-note">自由記述 (任意)</Label>
				<Textarea
					id="preferences-note"
					value={freeText}
					onChange={(e) => updateState({ freeText: e.target.value })}
					placeholder="食事の好みで他に教えたいこと"
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

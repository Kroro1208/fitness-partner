"use client";

import {
	CoachPromptResponseSchema,
	FreeTextParseResponseSchema,
} from "@fitness/contracts-ts";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";

import {
	profileQueryOptions,
	updateProfileMutationOptions,
} from "@/hooks/use-profile";
import {
	buildFreeTextParsePatch,
	type FreeTextParseResponseDto,
	type FreeTextStage,
	hasNonBlankFreeText,
	toFreeTextParseOutcome,
} from "@/lib/onboarding/free-text";
import {
	type OnboardingStage,
	resolveOnboardingStage,
} from "@/lib/onboarding/stage-routing";
import {
	type OnboardingProfile,
	type OnboardingProfilePatch,
	toCoachPromptRequestDto,
	toFreeTextParseRequestDto,
	toProfileSnapshotCacheKey,
} from "@/lib/profile/profile-mappers";

type ProfileSnapshot = Partial<OnboardingProfile>;

async function fetchCoachPrompt(
	targetStage: OnboardingStage,
	profileSnapshot: ProfileSnapshot,
): Promise<{ prompt: string; cached: boolean }> {
	const request = toCoachPromptRequestDto(targetStage, profileSnapshot);
	const res = await fetch("/api/onboarding/coach-prompt", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify(request),
	});
	if (!res.ok) throw new Error("coach_prompt_failed");
	return CoachPromptResponseSchema.parse(await res.json());
}

async function postFreeTextParse(
	stage: FreeTextStage,
	freeText: string,
	structuredSnapshot: ProfileSnapshot,
): Promise<FreeTextParseResponseDto> {
	const res = await fetch("/api/onboarding/free-text-parse", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify(
			toFreeTextParseRequestDto(stage, freeText, structuredSnapshot),
		),
	});
	if (!res.ok) throw new Error("parse_failed");
	return FreeTextParseResponseSchema.parse(await res.json());
}

export function coachPromptQueryOptions(
	targetStage: OnboardingStage,
	profileSnapshot: ProfileSnapshot,
) {
	return queryOptions({
		queryKey: [
			"coach-prompt",
			targetStage,
			toProfileSnapshotCacheKey(profileSnapshot),
		] as const,
		queryFn: () => fetchCoachPrompt(targetStage, profileSnapshot),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/**
 * Onboarding 画面で使う統合 hook。
 *
 * - `profile` / `currentStage` は camelCase ViewModel で露出する
 * - `patch()` は camelCase patch + 次ステージを受け取り、
 *   `updateProfileMutationOptions` 経由で送信する
 * - `prefetchCoachPrompt()` は次ステージの coach prompt を React Query の
 *   prefetchQuery に載せる (page transition を速くするため)
 * - `parseFreeText()` は fire-and-forget。LLM 抽出結果を noteField に格納する
 */
export function useOnboarding(initialProfile?: OnboardingProfile | null) {
	const qc = useQueryClient();
	const profileQuery = useQuery({
		...profileQueryOptions(),
		initialData: initialProfile,
	});
	const updateMutation = useMutation(updateProfileMutationOptions(qc));

	const patch = async (
		input: Partial<OnboardingProfilePatch>,
		nextStage: OnboardingStage | "complete",
	) => {
		await updateMutation.mutateAsync({
			...input,
			onboardingStage: nextStage,
		});
	};

	const prefetchCoachPrompt = (
		targetStage: OnboardingStage,
		snapshot: ProfileSnapshot,
	) => {
		qc.prefetchQuery(coachPromptQueryOptions(targetStage, snapshot));
	};

	const parseFreeText = (
		stage: FreeTextStage,
		freeText: string,
		snapshot: ProfileSnapshot,
	) => {
		if (!hasNonBlankFreeText(freeText)) return;
		// fire-and-forget: 抽出失敗はユーザー操作を止めない
		postFreeTextParse(stage, freeText, snapshot)
			.then((result) =>
				updateMutation.mutateAsync(
					buildFreeTextParsePatch(toFreeTextParseOutcome(result)),
				),
			)
			.catch((error) => {
				console.error("free-text parse failed", { stage, error });
			});
	};

	return {
		currentStage: resolveOnboardingStage(profileQuery.data?.onboardingStage),
		profile: profileQuery.data ?? null,
		isLoading: profileQuery.isLoading,
		patch,
		prefetchCoachPrompt,
		parseFreeText,
		isPatching: updateMutation.isPending,
		patchError: updateMutation.error,
	};
}

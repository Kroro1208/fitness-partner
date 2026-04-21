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
	readJsonResponseBody,
	toResponseErrorBody,
} from "@/lib/http/read-json-response";
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
type OnboardingAuxRequestError = Error & {
	status?: number;
	body?: unknown;
};
export type FreeTextParseResult =
	| { ok: true }
	| {
			ok: false;
			error: Record<string, unknown>;
	  };

function buildAuxRequestError(
	message: string,
	status: number,
	body: unknown,
): OnboardingAuxRequestError {
	return Object.assign(new Error(message), { status, body });
}

function buildCoachPromptRequest(
	targetStage: OnboardingStage,
	profileSnapshot: ProfileSnapshot,
) {
	return toCoachPromptRequestDto(targetStage, profileSnapshot);
}

function buildFreeTextParseRequest(
	stage: FreeTextStage,
	freeText: string,
	structuredSnapshot: ProfileSnapshot,
) {
	return toFreeTextParseRequestDto(stage, freeText, structuredSnapshot);
}

function isOnboardingAuxRequestError(
	error: Error,
): error is OnboardingAuxRequestError {
	return "status" in error || "body" in error;
}

function summarizeAuxRequestError(error: unknown): Record<string, unknown> {
	if (!(error instanceof Error)) {
		return { message: String(error) };
	}

	if (!isOnboardingAuxRequestError(error)) {
		return {
			name: error.name,
			message: error.message,
		};
	}

	return {
		name: error.name,
		message: error.message,
		status: error.status,
		body: error.body,
	};
}

function toFreeTextParsePatch(result: FreeTextParseResponseDto) {
	return buildFreeTextParsePatch(toFreeTextParseOutcome(result));
}

function toFreeTextParseFailure(
	error: unknown,
): Extract<FreeTextParseResult, { ok: false }> {
	return {
		ok: false,
		error: summarizeAuxRequestError(error),
	};
}

async function fetchCoachPrompt(
	targetStage: OnboardingStage,
	profileSnapshot: ProfileSnapshot,
): Promise<{ prompt: string; cached: boolean }> {
	const request = buildCoachPromptRequest(targetStage, profileSnapshot);
	const res = await fetch("/api/onboarding/coach-prompt", {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify(request),
	});
	if (!res.ok) {
		const errorBody = await readJsonResponseBody(res);
		throw buildAuxRequestError(
			"coach_prompt_failed",
			res.status,
			toResponseErrorBody(errorBody),
		);
	}
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
			buildFreeTextParseRequest(stage, freeText, structuredSnapshot),
		),
	});
	if (!res.ok) {
		const errorBody = await readJsonResponseBody(res);
		throw buildAuxRequestError(
			"parse_failed",
			res.status,
			toResponseErrorBody(errorBody),
		);
	}
	return FreeTextParseResponseSchema.parse(await res.json());
}

export function coachPromptQueryOptions(
	targetStage: OnboardingStage,
	profileSnapshot: ProfileSnapshot,
) {
	const queryKey = [
		"coach-prompt",
		targetStage,
		toProfileSnapshotCacheKey(profileSnapshot),
	] satisfies readonly ["coach-prompt", OnboardingStage, string];

	return queryOptions({
		queryKey,
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
 * - `parseFreeText()` は LLM 抽出結果を noteField に格納し、失敗時は結果を返す
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

	const parseFreeText = async (
		stage: FreeTextStage,
		freeText: string,
		snapshot: ProfileSnapshot,
	): Promise<FreeTextParseResult> => {
		if (!hasNonBlankFreeText(freeText)) return { ok: true };

		try {
			const result = await postFreeTextParse(stage, freeText, snapshot);
			await updateMutation.mutateAsync(toFreeTextParsePatch(result));
			return { ok: true };
		} catch (error) {
			const failure = toFreeTextParseFailure(error);
			console.warn("free-text parse failed", {
				stage,
				error: failure.error,
			});
			return failure;
		}
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

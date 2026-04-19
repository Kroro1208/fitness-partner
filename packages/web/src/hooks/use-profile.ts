"use client";

import {
	UpdateUserProfileInputSchema,
	UserProfileSchema,
} from "@fitness/contracts-ts";
import {
	mutationOptions,
	type QueryClient,
	queryOptions,
} from "@tanstack/react-query";
import { z } from "zod";

import { ApiError, apiClient } from "@/lib/api-client";
import {
	type OnboardingProfile,
	type OnboardingProfilePatch,
	toOnboardingProfile,
	toProfilePatchDto,
} from "@/lib/profile/profile-mappers";

export type { ProfileData } from "@/lib/profile/build-update-input";

const ProfileEnvelopeSchema = z.object({
	profile: UserProfileSchema,
});

export const PROFILE_QUERY_KEY = ["profile", "me"] as const;

export function profileQueryOptions() {
	return queryOptions<OnboardingProfile | null>({
		queryKey: PROFILE_QUERY_KEY,
		queryFn: async () => {
			try {
				const res = await apiClient("users/me/profile", ProfileEnvelopeSchema);
				return toOnboardingProfile(res.profile);
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) {
					return null;
				}
				throw error;
			}
		},
	});
}

/**
 * プロフィール PATCH mutation 設定。呼び出し側は camelCase patch を渡し、
 * 境界で snake_case DTO に変換してから送信する。レスポンスも camelCase に
 * 変換して React Query キャッシュへ反映する。
 */
export function updateProfileMutationOptions(queryClient: QueryClient) {
	return mutationOptions<
		OnboardingProfile | null,
		Error,
		Partial<OnboardingProfilePatch>
	>({
		mutationFn: async (input: Partial<OnboardingProfilePatch>) => {
			const dto = toProfilePatchDto(input);
			const parsed = UpdateUserProfileInputSchema.parse(dto);
			const res = await apiClient("users/me/profile", ProfileEnvelopeSchema, {
				method: "PATCH",
				body: JSON.stringify(parsed),
			});
			return toOnboardingProfile(res.profile);
		},
		onSuccess: (data) => {
			queryClient.setQueryData(PROFILE_QUERY_KEY, data);
			void queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
		},
	});
}

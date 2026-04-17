"use client";

import {
	type UpdateUserProfileInput,
	UpdateUserProfileInputSchema,
	UserProfileSchema,
} from "@fitness/contracts-ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

import { ApiError, apiClient } from "@/lib/api-client";

export type { ProfileData } from "@/lib/profile/build-update-input";

const ProfileEnvelopeSchema = z.object({
	profile: UserProfileSchema,
});

const PROFILE_QUERY_KEY = ["profile", "me"] as const;

export function useProfile() {
	return useQuery({
		queryKey: PROFILE_QUERY_KEY,
		queryFn: async () => {
			try {
				const res = await apiClient("users/me/profile", ProfileEnvelopeSchema);
				return res.profile;
			} catch (error) {
				if (error instanceof ApiError && error.status === 404) {
					return null;
				}
				throw error;
			}
		},
	});
}

export function useUpdateProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: UpdateUserProfileInput) => {
			const parsed = UpdateUserProfileInputSchema.parse(input);
			const res = await apiClient("users/me/profile", ProfileEnvelopeSchema, {
				method: "PATCH",
				body: JSON.stringify(parsed),
			});
			return res.profile;
		},
		onSuccess: (data) => {
			queryClient.setQueryData(PROFILE_QUERY_KEY, data);
			queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
		},
	});
}

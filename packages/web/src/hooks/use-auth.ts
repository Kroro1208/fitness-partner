"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { z } from "zod";

import { ApiError } from "@/lib/api-client";

const MeResponseSchema = z.object({
	user: z.object({
		id: z.string().min(1),
		email: z.string().email(),
	}),
});

export type AuthUser = z.infer<typeof MeResponseSchema>["user"];

async function fetchMe(): Promise<AuthUser | null> {
	const res = await fetch("/api/auth/me", { cache: "no-store" });
	if (res.status === 401) return null;
	if (!res.ok) {
		throw new ApiError(
			res.status,
			await res.json().catch(() => null),
			"me failed",
		);
	}
	const data = MeResponseSchema.parse(await res.json());
	return data.user;
}

export function useAuth() {
	const queryClient = useQueryClient();
	const router = useRouter();

	const query = useQuery({
		queryKey: ["auth", "me"],
		queryFn: fetchMe,
		staleTime: 5 * 60 * 1000,
	});

	const signOutMutation = useMutation({
		mutationFn: async () => {
			const res = await fetch("/api/auth/signout", { method: "POST" });
			if (!res.ok) throw new Error("signout failed");
		},
		onSuccess: () => {
			queryClient.clear();
			router.push("/signin");
			router.refresh();
		},
	});

	return {
		user: query.data ?? null,
		isLoading: query.isLoading,
		isAuthenticated: !!query.data,
		signOut: () => signOutMutation.mutate(),
		isSigningOut: signOutMutation.isPending,
	};
}

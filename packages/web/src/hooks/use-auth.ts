"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { ApiError } from "@/lib/api-client";
import {
	readJsonResponseBody,
	toResponseErrorBody,
} from "@/lib/http/read-json-response";

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
		const errorBody = await readJsonResponseBody(res);
		throw new ApiError(res.status, toResponseErrorBody(errorBody), "me failed");
	}
	const data = MeResponseSchema.parse(await res.json());
	return data.user;
}

export function useAuth() {
	const queryClient = useQueryClient();
	const router = useRouter();
	// signOut 失敗時の UI 通知用 local state。
	// 旧実装は `signOutMutation` に onError がなく、失敗が silent failure
	// だったため、最低限ユーザーが「失敗した」と認識できる出口を作る。
	const [signOutError, setSignOutError] = useState<string | null>(null);

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
			setSignOutError(null);
			queryClient.clear();
			router.replace("/signin");
		},
		onError: (error) => {
			// 旧実装は onError 不在で silent failure だった。
			// ユーザー由来のメッセージは UI 側で固定文言にマップ前提のため、
			// ここでは「失敗した」というシグナルだけ state に置く。
			console.warn("signout failed", {
				name: error instanceof Error ? error.name : "unknown",
				message: error instanceof Error ? error.message : String(error),
			});
			setSignOutError(
				"ログアウトに失敗しました。通信を確認して再度お試しください。",
			);
		},
	});

	return {
		user: query.data ?? null,
		isLoading: query.isLoading,
		isAuthenticated: !!query.data,
		signOut: () => {
			setSignOutError(null);
			signOutMutation.mutate();
		},
		isSigningOut: signOutMutation.isPending,
		signOutError,
	};
}

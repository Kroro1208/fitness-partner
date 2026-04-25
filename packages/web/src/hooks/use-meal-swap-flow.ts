"use client";

import { useCallback, useRef, useState } from "react";

import { useSwapApply, useSwapCandidates } from "@/hooks/use-meal-swap";
import type { MealVM } from "@/lib/plan/plan-mappers";

type MealSlot = MealVM["slot"];

export interface SwapTarget {
	date: string;
	slot: MealSlot;
}

export interface MealSwapSession {
	target: SwapTarget;
	proposalId: string | null;
	candidates: MealVM[] | undefined;
	loadingCandidates: boolean;
	loadingApply: boolean;
	error: string | null;
}

function createLoadingSession(target: SwapTarget): MealSwapSession {
	return {
		target,
		proposalId: null,
		candidates: undefined,
		loadingCandidates: true,
		loadingApply: false,
		error: null,
	};
}

function createResolvedSession(
	target: SwapTarget,
	data: { proposalId: string; candidates: MealVM[] },
): MealSwapSession {
	return {
		target,
		proposalId: data.proposalId,
		candidates: data.candidates,
		loadingCandidates: false,
		loadingApply: false,
		error: null,
	};
}

function createFailedSession(
	target: SwapTarget,
	error: string,
): MealSwapSession {
	return {
		target,
		proposalId: null,
		candidates: [],
		loadingCandidates: false,
		loadingApply: false,
		error,
	};
}

function markApplyingSession(
	session: MealSwapSession | null,
): MealSwapSession | null {
	if (session === null) return null;
	return {
		...session,
		loadingApply: true,
		error: null,
	};
}

function withSessionError(
	session: MealSwapSession | null,
	error: string,
): MealSwapSession | null {
	if (session === null) return null;
	return {
		...session,
		loadingApply: false,
		error,
	};
}

export function useMealSwapFlow(weekStart: string) {
	const swapCandidates = useSwapCandidates();
	const swapApply = useSwapApply(weekStart);
	const requestIdRef = useRef(0);
	const [session, setSession] = useState<MealSwapSession | null>(null);

	const requestCandidates = useCallback(
		async (target: SwapTarget) => {
			const requestId = requestIdRef.current + 1;
			requestIdRef.current = requestId;
			setSession(createLoadingSession(target));
			try {
				const data = await swapCandidates.mutateAsync({
					weekStart,
					date: target.date,
					slot: target.slot,
				});
				if (requestIdRef.current !== requestId) return;
				setSession(createResolvedSession(target, data));
			} catch (err) {
				if (requestIdRef.current !== requestId) return;
				setSession(createFailedSession(target, toErrorMessage(err)));
			}
		},
		[swapCandidates, weekStart],
	);

	const openSwap = useCallback(
		(date: string, slot: MealSlot) => {
			void requestCandidates({ date, slot });
		},
		[requestCandidates],
	);

	const regenerate = useCallback(() => {
		if (session === null) return;
		void requestCandidates(session.target);
	}, [requestCandidates, session]);

	const apply = useCallback(
		async (chosenIndex: number) => {
			if (session === null || session.proposalId === null) return;
			const requestId = requestIdRef.current;
			setSession(markApplyingSession);
			try {
				await swapApply.mutateAsync({
					proposalId: session.proposalId,
					chosenIndex,
				});
				if (requestIdRef.current !== requestId) return;
				requestIdRef.current += 1;
				setSession(null);
				swapCandidates.reset();
				swapApply.reset();
			} catch (err) {
				if (requestIdRef.current !== requestId) return;
				setSession((prev) => withSessionError(prev, toErrorMessage(err)));
			}
		},
		[session, swapApply, swapCandidates],
	);

	const close = useCallback(() => {
		requestIdRef.current += 1;
		setSession(null);
		swapCandidates.reset();
		swapApply.reset();
	}, [swapApply, swapCandidates]);

	return {
		session,
		openSwap,
		regenerate,
		apply,
		close,
		swapDisabled: session !== null,
	};
}

function toErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return "不明なエラーが発生しました";
}

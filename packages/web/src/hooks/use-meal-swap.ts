"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { swapApply, swapCandidates } from "@/lib/api/plans";
import type { WeeklyPlanVM } from "@/lib/plan/plan-mappers";
import { replaceDayInPlan } from "@/lib/plan/plan-mutations";
import { planQueryKey } from "@/lib/plan/plan-query";

type MealSlot = "breakfast" | "lunch" | "dinner" | "dessert";

/** Meal swap 候補生成 mutation。成功で `{ proposal_id, proposal_expires_at, candidates }` を返す。 */
export function useSwapCandidates() {
	return useMutation({
		mutationFn: (input: { weekStart: string; date: string; slot: MealSlot }) =>
			swapCandidates(input),
	});
}

/** Meal swap 確定 mutation。成功で該当 day を plan cache に反映して revision を更新。 */
export function useSwapApply(weekStart: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (input: { proposalId: string; chosenIndex: number }) =>
			swapApply({ weekStart, ...input }),
		onSuccess: (data) => {
			qc.setQueryData<WeeklyPlanVM | null>(planQueryKey(weekStart), (prev) => {
				// cache に plan が無い (undefined) / null の場合は書き込まない
				// (undefined を返すと setQueryData は cache を触らない契約)
				if (prev === undefined || prev === null) return prev;
				return replaceDayInPlan(prev, data.updatedDay, data.revision);
			});
		},
	});
}

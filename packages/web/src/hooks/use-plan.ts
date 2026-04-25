"use client";

import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";

import { fetchWeeklyPlan, generatePlan } from "@/lib/api/plans";
import type { WeeklyPlanVM } from "@/lib/plan/plan-mappers";
import { planQueryKey } from "@/lib/plan/plan-query";

function planQueryOptions(weekStart: string) {
	return queryOptions({
		queryKey: planQueryKey(weekStart),
		queryFn: async (): Promise<WeeklyPlanVM | null> =>
			fetchWeeklyPlan(weekStart),
		staleTime: 60_000,
	});
}

export function useWeeklyPlan(
	weekStart: string,
	options: { initialData?: WeeklyPlanVM | null } = {},
) {
	return useQuery({
		...planQueryOptions(weekStart),
		...(options.initialData !== undefined
			? { initialData: options.initialData }
			: {}),
	});
}

export function useGeneratePlan() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: generatePlan,
		onSuccess: (data, variables) => {
			// 画面の `useWeeklyPlan(weekStart)` は mutation 入力の週。API の `data.weekStart`
			// が一瞬でもずれるとキャッシュが当たらず、成功後も空プラン/エラー表示に
			// 取り残されるため、必ず `variables.weekStart` へ入れる。API 週はフォールバック用に二重登録。
			qc.setQueryData(planQueryKey(variables.weekStart), data.weeklyPlan);
			if (data.weekStart !== variables.weekStart) {
				qc.setQueryData(planQueryKey(data.weekStart), data.weeklyPlan);
			}
		},
	});
}

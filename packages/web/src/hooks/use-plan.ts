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
		onSuccess: (data) => {
			qc.setQueryData(
				planQueryOptions(data.weekStart).queryKey,
				data.weeklyPlan,
			);
		},
	});
}

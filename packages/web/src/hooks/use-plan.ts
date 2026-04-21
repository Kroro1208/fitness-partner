"use client";

import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";

import { fetchWeeklyPlanDto, generatePlanDto } from "@/lib/api/plans";
import { type WeeklyPlanVM, weeklyPlanToVM } from "@/lib/plan/plan-mappers";

function planQueryOptions(weekStart: string) {
	return queryOptions({
		queryKey: ["weekly-plan", weekStart] as const,
		queryFn: async (): Promise<WeeklyPlanVM | null> => {
			const dto = await fetchWeeklyPlanDto(weekStart);
			return dto === null ? null : weeklyPlanToVM(dto);
		},
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
		mutationFn: generatePlanDto,
		onSuccess: (data) => {
			qc.setQueryData(
				planQueryOptions(data.week_start).queryKey,
				weeklyPlanToVM(data.weekly_plan),
			);
		},
	});
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { DailySummaryCard } from "@/components/domain/daily-summary-card";
import { MacroTargetsCard } from "@/components/domain/macro-targets-card";
import { PlanEmptyState } from "@/components/domain/plan-empty-state";
import { PlanErrorBanner } from "@/components/domain/plan-error-banner";
import { PlanLoadingState } from "@/components/domain/plan-loading-state";
import { SevenDayMealList } from "@/components/domain/seven-day-meal-list";
import { useGeneratePlan, useWeeklyPlan } from "@/hooks/use-plan";
import { todayJstString } from "@/lib/date/week-start";
import type { WeeklyPlanVM } from "@/lib/plan/plan-mappers";

export function HomeContent({
	weekStart,
	initialPlan,
}: {
	weekStart: string;
	initialPlan?: WeeklyPlanVM | null;
}) {
	const router = useRouter();
	const search = useSearchParams();
	const planError = search.get("planError") === "1";

	const {
		data: plan,
		isLoading,
		isError,
	} = useWeeklyPlan(weekStart, { initialData: initialPlan });
	const generate = useGeneratePlan();

	const triggerGeneratePlan = useCallback(() => {
		if (generate.isPending) return;
		generate.mutate(
			{ weekStart },
			{
				onSuccess: () => {
					if (planError) router.replace("/home");
				},
			},
		);
	}, [generate, weekStart, planError, router]);

	if (generate.isPending && !plan)
		return <PlanLoadingState message="再生成中..." />;

	if (planError && !plan)
		return (
			<PlanErrorBanner
				onRetry={triggerGeneratePlan}
				isPending={generate.isPending}
			/>
		);
	if (isLoading) return <PlanLoadingState />;
	if (isError && !plan)
		return (
			<PlanErrorBanner
				onRetry={triggerGeneratePlan}
				isPending={generate.isPending}
			/>
		);
	if (!plan)
		return (
			<PlanEmptyState
				onGenerate={triggerGeneratePlan}
				isPending={generate.isPending}
				isError={generate.isError}
			/>
		);

	const today =
		plan.days.find((d) => d.date === todayJstString()) ?? plan.days[0];
	return (
		<div className="space-y-4">
			{isError && (
				<PlanErrorBanner
					onRetry={triggerGeneratePlan}
					isPending={generate.isPending}
				/>
			)}
			<MacroTargetsCard plan={plan} />
			{today && <DailySummaryCard day={today} plan={plan} />}
			<SevenDayMealList days={plan.days} />
		</div>
	);
}

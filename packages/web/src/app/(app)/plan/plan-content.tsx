"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { DailyDetail } from "@/components/domain/daily-detail";
import { DailyTabs } from "@/components/domain/daily-tabs";
import { HydrationCard } from "@/components/domain/hydration-card";
import { MacroTargetsCard } from "@/components/domain/macro-targets-card";
import { MealSwapSessionModal } from "@/components/domain/meal-swap-session-modal";
import { PersonalRulesCard } from "@/components/domain/personal-rules-card";
import { PlanEmptyState } from "@/components/domain/plan-empty-state";
import { PlanErrorBanner } from "@/components/domain/plan-error-banner";
import { PlanLoadingState } from "@/components/domain/plan-loading-state";
import { SnackSwapsCard } from "@/components/domain/snack-swaps-card";
import { SupplementsCard } from "@/components/domain/supplements-card";
import { TimelineCard } from "@/components/domain/timeline-card";
import { WeekSelector } from "@/components/domain/week-selector";
import { useMealSwapFlow } from "@/hooks/use-meal-swap-flow";
import { useGeneratePlan, useWeeklyPlan } from "@/hooks/use-plan";
import type { WeeklyPlanVM } from "@/lib/plan/plan-mappers";

export function PlanContent({
	weekStart,
	initialPlan,
}: {
	weekStart: string;
	initialPlan?: WeeklyPlanVM | null;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const {
		data: plan,
		isLoading,
		isError,
	} = useWeeklyPlan(weekStart, {
		initialData: initialPlan,
	});
	const generate = useGeneratePlan();
	const mealSwap = useMealSwapFlow(weekStart);

	const selectedDate = useMemo(() => {
		if (plan === null || plan === undefined) return null;
		const fromQuery = searchParams.get("day");
		if (fromQuery !== null && plan.days.some((d) => d.date === fromQuery)) {
			return fromQuery;
		}
		return plan.days[0]?.date ?? null;
	}, [plan, searchParams]);

	const onSelectDay = useCallback(
		(date: string) => {
			const params = new URLSearchParams(searchParams.toString());
			params.set("day", date);
			router.replace(`/plan?${params.toString()}`);
		},
		[router, searchParams],
	);

	const triggerGenerate = useCallback(() => {
		if (generate.isPending) return;
		generate.mutate({ weekStart });
	}, [generate, weekStart]);

	if (generate.isPending && !plan)
		return <PlanLoadingState message="プランを生成中..." />;
	if (isLoading) return <PlanLoadingState />;
	if (isError && !plan)
		return (
			<PlanErrorBanner
				onRetry={triggerGenerate}
				isPending={generate.isPending}
			/>
		);
	if (plan === null || plan === undefined)
		return (
			<PlanEmptyState
				onGenerate={triggerGenerate}
				isPending={generate.isPending}
				isError={generate.isError}
			/>
		);

	const selectedDay =
		selectedDate !== null
			? plan.days.find((d) => d.date === selectedDate)
			: plan.days[0];

	return (
		<div className="space-y-4">
			<WeekSelector currentWeekStart={plan.weekStart} />
			<MacroTargetsCard plan={plan} />
			<DailyTabs
				dates={plan.days.map((d) => d.date)}
				selectedDate={selectedDay?.date ?? plan.days[0].date}
				onSelect={onSelectDay}
			/>
			{selectedDay !== undefined && (
				<DailyDetail
					day={selectedDay}
					onSwap={(slot) => mealSwap.openSwap(selectedDay.date, slot)}
					pendingSlot={
						mealSwap.session !== null &&
						mealSwap.session.target.date === selectedDay.date
							? mealSwap.session.target.slot
							: null
					}
					swapDisabled={mealSwap.swapDisabled}
				/>
			)}
			<SnackSwapsCard snackSwaps={plan.snackSwaps} />
			<HydrationCard hydration={plan.hydration} />
			<SupplementsCard supplements={plan.supplementRecommendations} />
			<PersonalRulesCard rules={plan.personalRules} />
			<TimelineCard notes={plan.timelineNotes} />

			<MealSwapSessionModal
				session={mealSwap.session}
				onClose={mealSwap.close}
				onApply={mealSwap.apply}
				onRegenerate={mealSwap.regenerate}
			/>
		</div>
	);
}

"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { DailySummaryCard } from "@/components/domain/daily-summary-card";
import { HydrationCard } from "@/components/domain/hydration-card";
import { MacroTargetsCard } from "@/components/domain/macro-targets-card";
import { MealSwapSessionModal } from "@/components/domain/meal-swap-session-modal";
import { PersonalRulesCard } from "@/components/domain/personal-rules-card";
import { PlanEmptyState } from "@/components/domain/plan-empty-state";
import { PlanErrorBanner } from "@/components/domain/plan-error-banner";
import { PlanLoadingState } from "@/components/domain/plan-loading-state";
import { SevenDayMealList } from "@/components/domain/seven-day-meal-list";
import { SnackSwapsCard } from "@/components/domain/snack-swaps-card";
import { SupplementsCard } from "@/components/domain/supplements-card";
import { TimelineCard } from "@/components/domain/timeline-card";
import { useMealSwapFlow } from "@/hooks/use-meal-swap-flow";
import { useGeneratePlan, useWeeklyPlan } from "@/hooks/use-plan";
import type { WeeklyPlanVM } from "@/lib/plan/plan-mappers";

type HomeContentProps = {
	weekStart: string;
	today: string;
	initialPlan?: WeeklyPlanVM | null;
	planError?: boolean;
};

export function HomeContent({
	weekStart,
	today,
	initialPlan,
	planError = false,
}: HomeContentProps) {
	const router = useRouter();

	const {
		data: plan,
		isLoading,
		isError,
	} = useWeeklyPlan(weekStart, { initialData: initialPlan });
	const generate = useGeneratePlan();
	const mealSwap = useMealSwapFlow(weekStart);

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

	const todayPlan = plan.days.find((d) => d.date === today) ?? plan.days[0];
	return (
		<div className="space-y-4">
			{isError && (
				<PlanErrorBanner
					onRetry={triggerGeneratePlan}
					isPending={generate.isPending}
				/>
			)}
			<MacroTargetsCard plan={plan} />
			{todayPlan && <DailySummaryCard day={todayPlan} plan={plan} />}
			<SevenDayMealList
				days={plan.days}
				onSwap={mealSwap.openSwap}
				pendingTarget={mealSwap.session?.target ?? null}
				swapDisabled={mealSwap.swapDisabled}
			/>
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

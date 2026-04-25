import { Suspense } from "react";

import { PlanLoadingState } from "@/components/domain/plan-loading-state";
import { weekStartOf } from "@/lib/date/week-start";
import { getWeeklyPlanServerSideResult } from "@/lib/plan/server";

import { PlanContent } from "./plan-content";

export default async function PlanPage() {
	const weekStart = weekStartOf(new Date());
	const result = await getWeeklyPlanServerSideResult(weekStart);
	const initialPlan = result.ok ? result.plan : undefined;
	return (
		<Suspense fallback={<PlanLoadingState />}>
			<PlanContent weekStart={weekStart} initialPlan={initialPlan} />
		</Suspense>
	);
}

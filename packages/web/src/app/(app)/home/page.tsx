import { Suspense } from "react";

import { PlanLoadingState } from "@/components/domain/plan-loading-state";
import { todayJstString, weekStartOf } from "@/lib/date/week-start";
import { getWeeklyPlanServerSideResult } from "@/lib/plan/server";

import { HomeContent } from "./home-content";

type HomePageProps = {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
	const now = new Date();
	const weekStart = weekStartOf(now);
	const today = todayJstString(now);
	const params = (await searchParams) ?? {};
	const planError = params.planError === "1";
	const initialPlanResult = await getWeeklyPlanServerSideResult(weekStart);
	return (
		<Suspense fallback={<PlanLoadingState />}>
			<HomeContent
				weekStart={weekStart}
				today={today}
				initialPlan={initialPlanResult.ok ? initialPlanResult.plan : undefined}
				planError={planError}
			/>
		</Suspense>
	);
}

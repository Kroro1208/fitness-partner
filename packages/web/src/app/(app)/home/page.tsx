import { weekStartOf } from "@/lib/date/week-start";
import { getWeeklyPlanServerSideResult } from "@/lib/plan/server";

import { HomeContent } from "./home-content";

export default async function HomePage() {
	const weekStart = weekStartOf(new Date());
	const initialPlanResult = await getWeeklyPlanServerSideResult(weekStart);
	return (
		<HomeContent
			weekStart={weekStart}
			initialPlan={initialPlanResult.ok ? initialPlanResult.plan : undefined}
		/>
	);
}

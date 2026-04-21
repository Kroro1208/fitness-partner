import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { DayPlanVM, WeeklyPlanVM } from "@/lib/plan/plan-mappers";

export function DailySummaryCard({
	day,
	plan,
}: {
	day: DayPlanVM;
	plan: WeeklyPlanVM;
}) {
	const pct = Math.round(
		(day.dailyTotalCaloriesKcal / plan.targetCaloriesKcal) * 100,
	);
	return (
		<Card>
			<CardHeader>
				<CardTitle>今日のサマリー</CardTitle>
				<CardDescription>
					{day.date} — {day.theme}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-1 text-sm">
				<div>
					{day.dailyTotalCaloriesKcal} / {plan.targetCaloriesKcal} kcal{" "}
					<span className="text-neutral-500">({pct}%)</span>
				</div>
				<div className="text-neutral-600">
					P{day.dailyTotalProteinG.toFixed(0)} F{day.dailyTotalFatG.toFixed(0)}{" "}
					C{day.dailyTotalCarbsG.toFixed(0)}
				</div>
			</CardContent>
		</Card>
	);
}

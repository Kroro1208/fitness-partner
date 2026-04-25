import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ProgressRing } from "@/components/ui/progress-ring";
import type { DayPlanVM, WeeklyPlanVM } from "@/lib/plan/plan-mappers";

function formatDayLabel(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return iso;
	const date = new Date(Date.UTC(y, m - 1, d));
	const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
	return `${m}/${d} (${weekday})`;
}

export function DailySummaryCard({
	day,
	plan,
}: {
	day: DayPlanVM;
	plan: WeeklyPlanVM;
}) {
	const consumed = day.dailyTotalCaloriesKcal;
	const target = plan.targetCaloriesKcal;
	const pct = Math.round((consumed / target) * 100);
	const remaining = Math.max(0, target - consumed);
	const over = Math.max(0, consumed - target);

	return (
		<Card>
			<CardHeader>
				<CardTitle>今日のサマリー</CardTitle>
				<CardDescription>
					{formatDayLabel(day.date)} — {day.theme}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center gap-5">
				<ProgressRing
					value={pct}
					label={`${pct}%`}
					sublabel="達成"
					ariaLabel={`カロリー達成率 ${pct}%`}
				/>
				<dl className="flex-1 space-y-2 text-body">
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-caption text-neutral-600">摂取</dt>
						<dd className="font-semibold tabular text-neutral-900">
							{consumed}
							<span className="ml-0.5 text-caption font-normal text-neutral-500">
								/ {target} kcal
							</span>
						</dd>
					</div>
					<div className="flex items-baseline justify-between gap-3">
						<dt className="text-caption text-neutral-600">
							{over > 0 ? "超過" : "残り"}
						</dt>
						<dd
							className={`font-semibold tabular ${
								over > 0 ? "text-danger-700" : "text-primary-600"
							}`}
						>
							{over > 0 ? `+${over}` : remaining} kcal
						</dd>
					</div>
					<div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-2 text-caption text-neutral-600">
						<span>
							P{" "}
							<span className="tabular text-neutral-900">
								{day.dailyTotalProteinG.toFixed(0)}
							</span>
						</span>
						<span>
							F{" "}
							<span className="tabular text-neutral-900">
								{day.dailyTotalFatG.toFixed(0)}
							</span>
						</span>
						<span>
							C{" "}
							<span className="tabular text-neutral-900">
								{day.dailyTotalCarbsG.toFixed(0)}
							</span>
						</span>
					</div>
				</dl>
			</CardContent>
		</Card>
	);
}

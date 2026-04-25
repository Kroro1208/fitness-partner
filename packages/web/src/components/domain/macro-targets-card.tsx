import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { WeeklyPlanVM } from "@/lib/plan/plan-mappers";

export function MacroTargetsCard({ plan }: { plan: WeeklyPlanVM }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>1 日の目標</CardTitle>
				<CardDescription>
					あなたに合わせた カロリー・PFC (タンパク質/脂質/炭水化物) 目標
				</CardDescription>
			</CardHeader>
			<CardContent className="grid grid-cols-4 gap-2 text-center">
				<Stat label="kcal" value={plan.targetCaloriesKcal} />
				<Stat label="P (g)" value={plan.targetProteinG} />
				<Stat label="F (g)" value={plan.targetFatG} />
				<Stat label="C (g)" value={plan.targetCarbsG} />
			</CardContent>
		</Card>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="rounded-md bg-neutral-100 p-3">
			<div className="text-title font-semibold tabular text-neutral-900 leading-none">
				{Math.round(value)}
			</div>
			<div className="mt-1 text-caption text-neutral-600">{label}</div>
		</div>
	);
}

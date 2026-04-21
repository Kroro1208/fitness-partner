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
				<CardDescription>あなたに合わせた calorie / macro 目標</CardDescription>
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
		<div className="rounded bg-neutral-50 p-2">
			<div className="text-lg font-semibold">{Math.round(value)}</div>
			<div className="text-xs text-neutral-500">{label}</div>
		</div>
	);
}

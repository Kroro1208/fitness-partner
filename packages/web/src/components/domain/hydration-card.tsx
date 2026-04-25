import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withDuplicateKeys } from "@/lib/list-keys";
import type { HydrationVM } from "@/lib/plan/plan-mappers";

export function HydrationCard({ hydration }: { hydration: HydrationVM }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-body">水分目標</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3 text-body">
				<div className="flex items-baseline gap-2">
					<span className="text-h3 font-semibold tabular text-primary-700">
						{hydration.targetLiters.toFixed(1)}
					</span>
					<span className="text-caption text-neutral-600">L / 日</span>
				</div>
				{hydration.breakdown.length === 0 ? (
					<p className="text-caption text-neutral-600">
						具体的な配分は今週なし。こまめに摂取してください。
					</p>
				) : (
					<ul className="list-disc space-y-1 pl-5 text-caption text-neutral-700">
						{withDuplicateKeys(hydration.breakdown, String).map((entry) => (
							<li key={entry.key}>{entry.item}</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SnackSwapVM } from "@/lib/plan/plan-mappers";

export function SnackSwapsCard({ snackSwaps }: { snackSwaps: SnackSwapVM[] }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-body">間食の置き換え</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-body">
				{snackSwaps.length === 0 ? (
					<p className="text-caption text-neutral-600">
						今週の置き換え候補はありません。
					</p>
				) : (
					<ul className="space-y-3">
						{snackSwaps.map((s) => (
							<li
								key={`${s.currentSnack}-${s.replacement}-${s.caloriesKcal}-${s.whyItWorks}`}
								className="rounded-md border border-neutral-200 bg-bg-surface p-3"
							>
								<div className="flex items-baseline justify-between gap-2">
									<span className="text-neutral-900">
										<span className="text-caption text-neutral-500">
											置き換え前:
										</span>{" "}
										{s.currentSnack}
										<span className="mx-2 text-neutral-300" aria-hidden>
											→
										</span>
										<span className="font-medium">{s.replacement}</span>
									</span>
									<span className="shrink-0 tabular text-caption text-neutral-700">
										{s.caloriesKcal}
										<span className="ml-0.5 text-neutral-500">kcal</span>
									</span>
								</div>
								<p className="mt-1 text-caption text-neutral-700">
									{s.whyItWorks}
								</p>
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

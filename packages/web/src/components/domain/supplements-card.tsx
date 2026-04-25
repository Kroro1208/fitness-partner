import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SupplementRecommendationVM } from "@/lib/plan/plan-mappers";

export function SupplementsCard({
	supplements,
}: {
	supplements: SupplementRecommendationVM[];
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-body">サプリ推奨</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-body">
				{supplements.length === 0 ? (
					<p className="text-caption text-neutral-600">
						現時点で追加サプリは推奨しません。食事から摂取を優先してください。
					</p>
				) : (
					<ul className="space-y-3">
						{supplements.map((s) => (
							<li
								key={s.name}
								className="rounded-md border border-neutral-200 bg-bg-surface p-3"
							>
								<div className="flex items-baseline justify-between gap-2">
									<span className="font-medium text-neutral-900">{s.name}</span>
									<span className="shrink-0 text-caption text-neutral-700">
										<span className="tabular">{s.dose}</span>
										<span className="mx-2 text-neutral-300" aria-hidden>
											·
										</span>
										{s.timing}
									</span>
								</div>
								<p className="mt-1 text-caption text-neutral-700">
									{s.whyRelevant}
								</p>
								{s.caution !== null && s.caution.length > 0 && (
									<p className="mt-2 rounded border border-warning-300 bg-warning-50 px-2 py-1 text-caption text-warning-700">
										注意: {s.caution}
									</p>
								)}
							</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

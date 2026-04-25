import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BlockedNoticeCardProps = {
	reasons: string[];
};

const REASON_LABELS: Record<string, string> = {
	pregnancy_or_breastfeeding: "妊娠中または授乳中",
	eating_disorder_history: "摂食障害の既往",
	doctor_diet_restriction: "医師からの食事制限指示",
};

export function BlockedNoticeCard({ reasons }: BlockedNoticeCardProps) {
	return (
		<Card className="border-danger-500 bg-danger-100">
			<CardHeader>
				<CardTitle className="text-danger-700">
					通常プランの作成を停止しています
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-sm text-neutral-900">
					以下の情報から、一般的なダイエットプランをそのまま提示することが適切でないと判断しました。
				</p>
				<ul className="list-disc pl-5 text-sm text-neutral-900 space-y-1">
					{reasons.map((r) => (
						<li key={r}>{REASON_LABELS[r] ?? r}</li>
					))}
				</ul>
				<p className="text-sm text-neutral-700">
					専門家 (医師・管理栄養士など)
					への相談をおすすめします。一般的な健康情報を含む参考コンテンツのみ継続してご利用いただけます。
				</p>
			</CardContent>
		</Card>
	);
}

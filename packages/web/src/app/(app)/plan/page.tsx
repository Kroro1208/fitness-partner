import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function PlanPage() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>7日プラン</CardTitle>
				<CardDescription>まだ未実装です</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-neutral-500">
					Plan 07
					ではオンボーディング完了までを実装しています。7日プラン生成は後続フェーズで接続します。
				</p>
			</CardContent>
		</Card>
	);
}

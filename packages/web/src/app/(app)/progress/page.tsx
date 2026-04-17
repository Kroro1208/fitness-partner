import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function ProgressPage() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>進捗</CardTitle>
				<CardDescription>準備中です</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-neutral-500">
					体重や食事の記録グラフがここに表示されます
				</p>
			</CardContent>
		</Card>
	);
}

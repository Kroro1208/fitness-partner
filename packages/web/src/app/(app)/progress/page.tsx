import { TrendingUp } from "lucide-react";

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
			<CardHeader className="flex flex-col items-start gap-3">
				<div
					aria-hidden
					className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600"
				>
					<TrendingUp className="h-5 w-5" />
				</div>
				<div>
					<CardTitle>進捗</CardTitle>
					<CardDescription>準備中の機能です</CardDescription>
				</div>
			</CardHeader>
			<CardContent>
				<p className="text-body text-neutral-600">
					体重・食事の記録と達成度のグラフがここに表示されます。
				</p>
			</CardContent>
		</Card>
	);
}

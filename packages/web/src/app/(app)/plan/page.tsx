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
				<CardDescription>準備中です</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-neutral-500">
					Plan 07 で食事と運動の 7 日プランが表示されます
				</p>
			</CardContent>
		</Card>
	);
}

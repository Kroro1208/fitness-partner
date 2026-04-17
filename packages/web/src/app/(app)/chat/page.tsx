import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function ChatPage() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>AI チャット</CardTitle>
				<CardDescription>未実装です</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-neutral-500">
					Plan 08 で AI チャット機能が実装されます
				</p>
			</CardContent>
		</Card>
	);
}

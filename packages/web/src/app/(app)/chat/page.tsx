import { MessageCircle } from "lucide-react";

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
			<CardHeader className="flex flex-col items-start gap-3">
				<div
					aria-hidden
					className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-accent-600"
				>
					<MessageCircle className="h-5 w-5" />
				</div>
				<div>
					<CardTitle>AI チャット</CardTitle>
					<CardDescription>チャット機能はまだ接続していません</CardDescription>
				</div>
			</CardHeader>
			<CardContent>
				<p className="text-body text-neutral-600">
					現在使えるAI機能は、オンボーディング内容にもとづく7日プラン生成です。チャット画面は、プランや記録を踏まえて相談できる状態になってから接続します。
				</p>
			</CardContent>
		</Card>
	);
}

"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
	const { user, isLoading } = useAuth();

	return (
		<div className="space-y-4">
			<div>
				<h2 className="text-xl font-semibold text-neutral-900">
					{isLoading
						? "読み込み中..."
						: user
							? `こんにちは、${user.email} さん`
							: "ようこそ"}
				</h2>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>今日のプラン</CardTitle>
					<CardDescription>
						セットアップは完了しました。プラン生成機能はまだ接続されていません。
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-neutral-500">
						Plan 07
						のスコープはオンボーディング完了までで、食事・運動プラン生成は後続フェーズです。
					</p>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>AI コーチ</CardTitle>
					<CardDescription>
						Plan 08 で AI チャット機能が利用できるようになります
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}

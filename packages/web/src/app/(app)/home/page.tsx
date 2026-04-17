"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";

export default function HomePage() {
	const { user, isLoading, signOut, isSigningOut } = useAuth();

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
						オンボーディングを完了して食事プランを作成しましょう
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-neutral-500">
						Plan 07 で食事・運動プランの本実装を行います
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

			<div>
				<Button
					variant="outline"
					onClick={() => signOut()}
					disabled={isSigningOut}
				>
					{isSigningOut ? "ログアウト中..." : "ログアウト"}
				</Button>
			</div>
		</div>
	);
}

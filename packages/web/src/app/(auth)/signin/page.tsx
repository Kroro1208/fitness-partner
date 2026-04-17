"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SignInPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSubmitting(true);
		try {
			const res = await fetch("/api/auth/signin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				if (res.status === 401)
					setError("メールアドレスまたはパスワードが違います");
				else if (res.status === 403) setError("メール確認が未完了です");
				else setError(body.error ?? "ログインに失敗しました");
				return;
			}
			router.push("/home");
			router.refresh();
		} catch {
			setError("通信エラーが発生しました");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>ログイン</CardTitle>
				<CardDescription>AI Fitness Partner にログインします</CardDescription>
			</CardHeader>
			<form onSubmit={onSubmit}>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="email">メールアドレス</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="password">パスワード</Label>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							required
							value={password}
							onChange={(e) => setPassword(e.target.value)}
						/>
					</div>
					{error && (
						<p className="text-sm text-danger-500" role="alert">
							{error}
						</p>
					)}
				</CardContent>
				<CardFooter className="flex flex-col gap-3">
					<Button type="submit" className="w-full" disabled={isSubmitting}>
						{isSubmitting ? "ログイン中..." : "ログイン"}
					</Button>
					<p className="text-sm text-neutral-500">
						アカウント未作成の方は{" "}
						<Link href="/signup" className="text-primary-500 underline">
							新規登録
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}

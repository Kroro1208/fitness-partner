"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useReducer } from "react";

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

type Step = "signup" | "confirm" | "done";

type FormField = "email" | "password" | "inviteCode" | "code";

type State = {
	step: Step;
	form: Record<FormField, string>;
	error: string | null;
	isSubmitting: boolean;
};

type Action =
	| { type: "set_field"; field: FormField; value: string }
	| { type: "submit_start" }
	| { type: "submit_error"; error: string }
	| { type: "signup_success" }
	| { type: "confirm_success" };

const initialState: State = {
	step: "signup",
	form: { email: "", password: "", inviteCode: "", code: "" },
	error: null,
	isSubmitting: false,
};

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case "set_field":
			return {
				...state,
				form: { ...state.form, [action.field]: action.value },
			};
		case "submit_start":
			return { ...state, isSubmitting: true, error: null };
		case "submit_error":
			return { ...state, isSubmitting: false, error: action.error };
		case "signup_success":
			return { ...state, isSubmitting: false, step: "confirm" };
		case "confirm_success":
			return { ...state, isSubmitting: false, step: "done" };
	}
}

export default function SignUpPage() {
	const router = useRouter();
	const [state, dispatch] = useReducer(reducer, initialState);
	const { step, form, error, isSubmitting } = state;

	async function onSignUp(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		dispatch({ type: "submit_start" });
		try {
			const res = await fetch("/api/auth/signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: form.email,
					password: form.password,
					inviteCode: form.inviteCode,
				}),
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				const message =
					body.error === "invalid_input"
						? "入力内容を確認してください"
						: "登録に失敗しました";
				dispatch({ type: "submit_error", error: message });
				return;
			}
			dispatch({ type: "signup_success" });
		} catch {
			dispatch({ type: "submit_error", error: "通信エラーが発生しました" });
		}
	}

	async function onConfirm(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		dispatch({ type: "submit_start" });
		try {
			const res = await fetch("/api/auth/signup/confirm", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: form.email, code: form.code }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				const message =
					body.error === "invalid_input"
						? "入力内容を確認してください"
						: "確認に失敗しました";
				dispatch({ type: "submit_error", error: message });
				return;
			}
			dispatch({ type: "confirm_success" });
			setTimeout(() => router.push("/signin"), 1500);
		} catch {
			dispatch({ type: "submit_error", error: "通信エラーが発生しました" });
		}
	}

	if (step === "done") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>登録完了</CardTitle>
					<CardDescription>ログインページに移動します...</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	if (step === "confirm") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>メール確認</CardTitle>
					<CardDescription>
						{form.email} に届いた確認コードを入力してください
					</CardDescription>
				</CardHeader>
				<form onSubmit={onConfirm}>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="code">確認コード</Label>
							<Input
								id="code"
								inputMode="numeric"
								required
								value={form.code}
								onChange={(e) =>
									dispatch({
										type: "set_field",
										field: "code",
										value: e.target.value,
									})
								}
							/>
						</div>
						{error && (
							<p className="text-sm text-danger-500" role="alert">
								{error}
							</p>
						)}
					</CardContent>
					<CardFooter>
						<Button type="submit" className="w-full" disabled={isSubmitting}>
							{isSubmitting ? "確認中..." : "確認"}
						</Button>
					</CardFooter>
				</form>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>新規登録</CardTitle>
				<CardDescription>招待コードが必要です</CardDescription>
			</CardHeader>
			<form onSubmit={onSignUp}>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="email">メールアドレス</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							required
							value={form.email}
							onChange={(e) =>
								dispatch({
									type: "set_field",
									field: "email",
									value: e.target.value,
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="password">パスワード（8文字以上）</Label>
						<Input
							id="password"
							type="password"
							autoComplete="new-password"
							minLength={8}
							required
							value={form.password}
							onChange={(e) =>
								dispatch({
									type: "set_field",
									field: "password",
									value: e.target.value,
								})
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="inviteCode">招待コード</Label>
						<Input
							id="inviteCode"
							required
							value={form.inviteCode}
							onChange={(e) =>
								dispatch({
									type: "set_field",
									field: "inviteCode",
									value: e.target.value,
								})
							}
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
						{isSubmitting ? "送信中..." : "登録"}
					</Button>
					<p className="text-sm text-neutral-500">
						既にアカウントをお持ちの方は{" "}
						<Link href="/signin" className="text-primary-500 underline">
							ログイン
						</Link>
					</p>
				</CardFooter>
			</form>
		</Card>
	);
}

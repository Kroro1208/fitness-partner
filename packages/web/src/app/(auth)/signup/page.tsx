"use client";

import Link from "next/link";
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
import {
	resolveConfirmErrorMessage,
	resolveSignupErrorMessage,
} from "@/lib/auth/signup-error-messages";
import {
	readJsonResponseBody,
	readResponseErrorCode,
} from "@/lib/http/read-json-response";

const passwordRequirementsPattern = [
	"(?=.*[a-z])",
	"(?=.*[A-Z])",
	"(?=.*\\d)",
	"(?=.*[^A-Za-z0-9]).{8,}",
].join("");
const PASSWORD_TITLE =
	"8 文字以上で、大文字・小文字・数字・記号 (!@#$%^&* など) を含めてください";
const INVALID_RESPONSE_MESSAGE =
	"サーバー応答の形式が不正です。時間をおいて再度お試しください。";

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

function unreachableAction(action: never): never {
	throw new Error(`Unexpected action: ${JSON.stringify(action)}`);
}

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
		default:
			return unreachableAction(action);
	}
}

type SubmitFailureInput = {
	status: number;
	retryAfter: string | null;
	errorCode: unknown;
};

function buildSignUpPayload(form: State["form"]) {
	return {
		email: form.email,
		password: form.password,
		inviteCode: form.inviteCode,
	};
}

function resolveSignUpFailureMessage(input: {
	payloadOk: boolean;
	failure: SubmitFailureInput;
}): string {
	if (!input.payloadOk) return INVALID_RESPONSE_MESSAGE;

	return resolveSignupErrorMessage(input.failure);
}

function resolveConfirmFailureMessage(input: {
	payloadOk: boolean;
	failure: SubmitFailureInput;
}): string {
	if (!input.payloadOk) return INVALID_RESPONSE_MESSAGE;

	return resolveConfirmErrorMessage(input.failure);
}

export default function SignUpPage() {
	const [state, dispatch] = useReducer(reducer, initialState);
	const { step, form, error, isSubmitting } = state;

	async function onSignUp(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		dispatch({ type: "submit_start" });
		try {
			const res = await fetch("/api/auth/signup", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(buildSignUpPayload(form)),
			});
			const payload = await readJsonResponseBody(res);
			if (!res.ok) {
				dispatch({
					type: "submit_error",
					error: resolveSignUpFailureMessage({
						payloadOk: payload.ok,
						failure: {
							status: res.status,
							retryAfter: res.headers.get("Retry-After"),
							errorCode: readResponseErrorCode(payload),
						},
					}),
				});
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
				const payload = await readJsonResponseBody(res);
				dispatch({
					type: "submit_error",
					error: resolveConfirmFailureMessage({
						payloadOk: payload.ok,
						failure: {
							status: res.status,
							retryAfter: res.headers.get("Retry-After"),
							errorCode: readResponseErrorCode(payload),
						},
					}),
				});
				return;
			}
			dispatch({ type: "confirm_success" });
		} catch {
			dispatch({ type: "submit_error", error: "通信エラーが発生しました" });
		}
	}

	if (step === "done") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>登録完了</CardTitle>
					<CardDescription>
						メール確認が完了しました。ログインページへ進んでください。
					</CardDescription>
				</CardHeader>
				<CardFooter>
					<Button asChild className="w-full">
						<Link href="/signin">ログインページへ</Link>
					</Button>
				</CardFooter>
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
							<p className="text-sm text-danger-700" role="alert">
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
						<Label htmlFor="password">パスワード</Label>
						<Input
							id="password"
							type="password"
							autoComplete="new-password"
							minLength={8}
							pattern={passwordRequirementsPattern}
							title={PASSWORD_TITLE}
							required
							aria-describedby="password-hint"
							value={form.password}
							onChange={(e) =>
								dispatch({
									type: "set_field",
									field: "password",
									value: e.target.value,
								})
							}
						/>
						<ul
							id="password-hint"
							className="text-xs text-neutral-500 list-disc pl-5 space-y-0.5"
						>
							<li>8 文字以上</li>
							<li>大文字・小文字を両方含む</li>
							<li>数字を含む</li>
							<li>記号を含む (例: !@#$%^&amp;*)</li>
						</ul>
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
						<p className="text-sm text-danger-700" role="alert">
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

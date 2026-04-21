"use client";

import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";

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
import { resolveSignInErrorMessage } from "@/lib/auth/signup-error-messages";
import {
	readJsonResponseBody,
	readResponseErrorCode,
} from "@/lib/http/read-json-response";

const signInSchema = z.object({
	email: z
		.string()
		.min(1, "メールアドレスを入力してください")
		.email("メールアドレスの形式が正しくありません"),
	password: z.string().min(1, "パスワードを入力してください"),
});

type SignInValues = z.infer<typeof signInSchema>;
const INVALID_RESPONSE_MESSAGE =
	"サーバー応答の形式が不正です。時間をおいて再度お試しください。";
const defaultSignInValues = {
	email: "",
	password: "",
} satisfies SignInValues;

function readMessage(value: unknown): string | null {
	if (value === null || typeof value !== "object") return null;
	if (!("message" in value)) return null;
	return typeof value.message === "string" ? value.message : null;
}

function buildSignInPayload(values: SignInValues) {
	return {
		email: values.email,
		password: values.password,
	};
}

function resolveSignInFailureMessage(input: {
	payloadOk: boolean;
	status: number;
	retryAfter: string | null;
	errorCode: unknown;
}): string {
	if (!input.payloadOk) return INVALID_RESPONSE_MESSAGE;

	return resolveSignInErrorMessage({
		status: input.status,
		retryAfter: input.retryAfter,
		errorCode: input.errorCode,
	});
}

async function submitSignIn(
	values: SignInValues,
): Promise<{ ok: true } | { ok: false; message: string }> {
	try {
		const res = await fetch("/api/auth/signin", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(buildSignInPayload(values)),
		});
		if (res.ok) return { ok: true };

		const payload = await readJsonResponseBody(res);
		return {
			ok: false,
			message: resolveSignInFailureMessage({
				payloadOk: payload.ok,
				status: res.status,
				retryAfter: res.headers.get("Retry-After"),
				errorCode: readResponseErrorCode(payload),
			}),
		};
	} catch {
		return { ok: false, message: "通信エラーが発生しました" };
	}
}

function formatFieldError(err: unknown): string {
	if (typeof err === "string") return err;
	const message = readMessage(err);
	if (message !== null) return message;
	return "";
}

function formatFormError(err: unknown): string {
	if (typeof err === "string") return err;
	const message = readMessage(err);
	if (message !== null) return message;
	return "ログインに失敗しました";
}

function collectFieldErrors(errors: unknown[]): string[] {
	return errors.flatMap((error) => {
		const message = formatFieldError(error);
		return message ? [message] : [];
	});
}

export default function SignInPage() {
	const router = useRouter();

	const form = useForm({
		defaultValues: defaultSignInValues,
		validators: {
			onChange: signInSchema,
			onSubmitAsync: async ({ value }) => {
				const result = await submitSignIn(value);
				if (!result.ok) {
					return { form: result.message };
				}
				router.replace("/home");
				return null;
			},
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>ログイン</CardTitle>
				<CardDescription>AI Fitness Partner にログインします</CardDescription>
			</CardHeader>
			<form
				noValidate
				action={async () => {
					await form.handleSubmit();
				}}
			>
				<CardContent className="space-y-4">
					<form.Field name="email">
						{(field) => {
							const errors = collectFieldErrors(field.state.meta.errors);
							const hasError = field.state.meta.isTouched && errors.length > 0;
							return (
								<div className="space-y-2">
									<Label htmlFor={field.name}>メールアドレス</Label>
									<Input
										id={field.name}
										name={field.name}
										type="email"
										autoComplete="email"
										required
										aria-invalid={hasError || undefined}
										aria-describedby={
											hasError ? `${field.name}-error` : undefined
										}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
									/>
									{hasError && (
										<p
											id={`${field.name}-error`}
											className="text-sm text-danger-500"
											role="alert"
										>
											{errors.join("、")}
										</p>
									)}
								</div>
							);
						}}
					</form.Field>

					<form.Field name="password">
						{(field) => {
							const errors = collectFieldErrors(field.state.meta.errors);
							const hasError = field.state.meta.isTouched && errors.length > 0;
							return (
								<div className="space-y-2">
									<Label htmlFor={field.name}>パスワード</Label>
									<Input
										id={field.name}
										name={field.name}
										type="password"
										autoComplete="current-password"
										required
										aria-invalid={hasError || undefined}
										aria-describedby={
											hasError ? `${field.name}-error` : undefined
										}
										value={field.state.value}
										onChange={(e) => field.handleChange(e.target.value)}
										onBlur={field.handleBlur}
									/>
									{hasError && (
										<p
											id={`${field.name}-error`}
											className="text-sm text-danger-500"
											role="alert"
										>
											{errors.join("、")}
										</p>
									)}
								</div>
							);
						}}
					</form.Field>

					<form.Subscribe selector={(state) => state.errorMap.onSubmit}>
						{(submitError) =>
							submitError ? (
								<p className="text-sm text-danger-500" role="alert">
									{formatFormError(submitError)}
								</p>
							) : null
						}
					</form.Subscribe>
				</CardContent>
				<CardFooter className="flex flex-col gap-3">
					<form.Subscribe
						selector={(state): readonly [boolean, boolean] => [
							state.canSubmit,
							state.isSubmitting,
						]}
					>
						{([canSubmit, isSubmitting]) => (
							<Button
								type="submit"
								className="w-full"
								disabled={!canSubmit || isSubmitting}
							>
								{isSubmitting ? "ログイン中..." : "ログイン"}
							</Button>
						)}
					</form.Subscribe>
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

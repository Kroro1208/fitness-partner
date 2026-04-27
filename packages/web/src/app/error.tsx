"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

// route segment 単位の Error Boundary。
//
// 旧実装の問題:
//   - `console.error(error)` だけで `error.digest` を別途観測する仕組みがなかった。
//     Next.js は本番ビルドで `error.message` を伏字にし、`digest` だけがクライアントに渡る。
//     digest を Sentry / observability に紐付けないと、ユーザー報告から
//     server-side stack を辿れない。
//
// 修正:
//   - error.digest を含めた構造化ログを出す。
//   - production では digest 以外見えないため、UI 側は固定文言だけにする。
//   - `error.message` は絶対に画面に出さない (skill: "catch した error をそのまま表示" 違反防止)。

export default function RootError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		// digest をキーに observability 基盤で server-side stack と突き合わせる。
		// production では error.message が伏字なため、digest が「事故 ID」になる。
		console.error("root error boundary", {
			name: error.name,
			// production では Next.js が message を redacted にするため、
			// 出ても "An error occurred in the Server Components render" 等の generic な文言。
			// 念のため出すが、UI には絶対に表示しない。
			message: error.message,
			digest: error.digest,
		});
	}, [error]);

	return (
		<div className="flex min-h-dvh items-center justify-center bg-bg-canvas px-4">
			<div className="max-w-md space-y-4 text-center">
				<div
					aria-hidden
					className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-100 text-danger-700"
				>
					<AlertTriangle className="h-6 w-6" />
				</div>
				<h1 className="text-display font-semibold tracking-tight text-neutral-900">
					問題が発生しました
				</h1>
				<p className="text-body text-neutral-600">
					再試行するか、しばらく待ってからもう一度開いてください。
				</p>
				{error.digest ? (
					<p className="text-caption text-neutral-500">
						事故 ID: {error.digest}
					</p>
				) : null}
				<Button onClick={() => reset()}>再試行</Button>
			</div>
		</div>
	);
}

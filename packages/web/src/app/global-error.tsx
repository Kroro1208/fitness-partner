"use client";

// global-error.tsx は root layout / template 自体で起きたエラーの最後の砦。
//
// なぜ追加したか:
//   - 旧構成は `app/error.tsx` のみで、root layout が throw した場合は
//     Next.js のデフォルト白画面に落ちていた (skill: "global-error.tsx の不在" HIGH)。
//   - global-error.tsx は **`<html>` と `<body>` を自分で出す必要がある** (Next.js 仕様)。
//     これは root layout が破損している前提の Boundary なので、layout の HTML 構造を
//     そのまま使えないから。
//
// 表示方針:
//   - 文言は最小限。CSS / Provider / I18n に依存しない pure HTML。
//   - error.digest だけ表示し、運営問い合わせ時の identity に使う。

import { useEffect } from "react";

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error("global error boundary", {
			name: error.name,
			message: error.message,
			digest: error.digest,
		});
	}, [error]);

	return (
		<html lang="ja">
			<body
				style={{
					fontFamily:
						"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
					margin: 0,
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					background: "#fafafa",
					color: "#171717",
				}}
			>
				<div
					style={{
						maxWidth: "32rem",
						padding: "2rem",
						textAlign: "center",
					}}
				>
					<h1
						style={{
							fontSize: "1.5rem",
							fontWeight: 600,
							marginBottom: "1rem",
						}}
					>
						問題が発生しました
					</h1>
					<p style={{ marginBottom: "1.5rem", color: "#525252" }}>
						再試行するか、しばらく待ってからもう一度開いてください。
					</p>
					{error.digest ? (
						<p
							style={{
								fontSize: "0.875rem",
								color: "#737373",
								marginBottom: "1.5rem",
							}}
						>
							事故 ID: {error.digest}
						</p>
					) : null}
					<button
						type="button"
						onClick={() => reset()}
						style={{
							padding: "0.5rem 1rem",
							borderRadius: "0.375rem",
							border: "1px solid #171717",
							background: "#171717",
							color: "#fff",
							cursor: "pointer",
							fontSize: "1rem",
						}}
					>
						再試行
					</button>
				</div>
			</body>
		</html>
	);
}

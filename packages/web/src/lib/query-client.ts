import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { ApiError, shouldRetryApiError } from "@/lib/api-client";

// グローバルな TanStack Query 設定。
//
// 旧実装の問題:
//   - `retry: 1` が HTTP status を見ずに一律 retry していた。
//     401 / 403 / 422 などの業務エラーまで retry してしまい、副作用ある状況
//     (例: 重複作成) で危険だった。
//   - グローバル onError なし。401 → ログイン誘導、5xx → トーストなど横断処理が
//     画面ごとに散在していた。
//
// 修正方針:
//   - retry を関数化し、ApiError.kind / status を見て 4xx は retry しない
//   - QueryCache / MutationCache の onError でログを集中。表示は画面側に任せる
//     (TanStack Query で状態を持っているため画面ハンドリングは既存どおり機能する)。

export function createQueryClient(): QueryClient {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error) => {
				// 4xx は業務エラーなので静観 (画面側で扱う)。
				// 5xx / network / parse は観測対象としてログ。
				if (shouldLogQueryError(error)) {
					console.warn("query error", summarizeQueryError(error));
				}
			},
		}),
		mutationCache: new MutationCache({
			onError: (error) => {
				if (shouldLogQueryError(error)) {
					console.warn("mutation error", summarizeQueryError(error));
				}
			},
		}),
		defaultOptions: {
			queries: {
				staleTime: 5 * 60 * 1000,
				// retry は関数化。
				// - failureCount は retry 試行回数 (0-indexed)。
				// - true を返すと再試行、false で諦める。
				// 旧 `retry: 1` を維持しつつ、4xx を除外して安全側に倒す。
				retry: shouldRetryApiError,
				refetchOnWindowFocus: false,
			},
			mutations: {
				// mutation はデフォルト 0 retry。副作用ある操作で重複適用を避ける
				// ため、retry したい場合は呼び出し側で明示的に有効化する。
				retry: false,
			},
		},
	});
}

function shouldLogQueryError(error: unknown): boolean {
	if (!(error instanceof ApiError)) return true;
	// 4xx は画面側が分岐するので global では静かに
	return error.kind !== "http_client";
}

function summarizeQueryError(error: unknown): Record<string, unknown> {
	if (error instanceof ApiError) {
		return {
			name: error.name,
			kind: error.kind,
			status: error.status,
			// body はサーバー由来 envelope。stack や user データを含む可能性は低いが
			// log volume 増を避けるため kind だけに留める。
		};
	}
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	return { value: String(error) };
}

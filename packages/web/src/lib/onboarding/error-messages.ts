// onboarding form 共通のエラー文言。
//
// なぜ定数化したか:
//   - 旧実装では「保存に失敗しました。」「自由記述の自動反映に失敗しました…」が
//     6 つのフォームで完全一致重複していた。
//   - 文言修正のたびに 6 ファイル変更が必要で、改修ミスで揺れる温床。
//   - 1 箇所に集約することで、UX レビュー時の文言変更コストを下げる。
//
// なぜ skill 本文の `{ ok: false; message }` 共通型ではなくこの定数モジュールか:
//   - エラー型は既存 (`patchError = mutation.error: Error`) を維持し、
//     **表示時に固定文言にマップ** する設計。これは skill: layer-conventions
//     "ユーザーに表示する文言は固定化" と整合する最小変更。

type OnboardingErrorMessageKey =
	| "patchFailed"
	| "patchFailedRetry"
	| "freeTextParseFailed";

export const ONBOARDING_ERROR_MESSAGES = {
	patchFailed: "保存に失敗しました。",
	patchFailedRetry: "保存に失敗しました。もう一度お試しください。",
	freeTextParseFailed:
		"自由記述の自動反映に失敗しました。このままでは内容を提案に反映できないため、もう一度お試しください。",
} as const satisfies Record<OnboardingErrorMessageKey, string>;

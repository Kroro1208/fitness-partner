const SIGNUP_ERROR_MESSAGES: Record<string, string> = {
	invalid_input: "入力内容を確認してください",
	invite_validation_failed:
		"招待コードが無効か、形式が正しくないか、既に使用済みです。コピペの余分な空白がないかも確認してください",
	invite_verification_unavailable:
		"認証サービスが一時的に利用できません。数分後に再度お試しください",
	auth_upstream_unavailable:
		"認証サービスが一時的に利用できません。数分後に再度お試しください",
	auth_configuration_error:
		"現在、新規登録を完了できません。時間をおいて再度お試しください。改善しない場合は運営にお問い合わせください。",
	internal_error:
		"サーバー側の不具合か設定の問題で登録できませんでした。時間をおいて再度お試しください。改善しない場合は管理者に連絡してください",
	auth_failed:
		"登録に失敗しました。メールアドレスは既に登録されているか、パスワードが要件を満たしていない可能性があります",
};

const FALLBACK_MESSAGE =
	"登録に失敗しました。通信や入力内容を確認し、改善しない場合は管理者に連絡してください";
const SERVER_ERROR_MESSAGE = SIGNUP_ERROR_MESSAGES.internal_error;

const SIGNIN_ERROR_MESSAGES: Record<string, string> = {
	invalid_input: "入力内容を確認してください",
	auth_failed:
		"メールアドレスまたはパスワードが正しくありません。入力内容を確認してください",
	auth_configuration_error:
		"現在、ログインを完了できません。時間をおいて再度お試しください。改善しない場合は運営にお問い合わせください。",
	internal_error:
		"サーバー側の不具合か設定の問題でログインできませんでした。時間をおいて再度お試しください。改善しない場合は管理者に連絡してください",
	auth_upstream_unavailable:
		"認証サービスが一時的に利用できません。数分後に再度お試しください",
};

const SIGNIN_FALLBACK_MESSAGE =
	"ログインに失敗しました。通信や入力内容を確認し、改善しない場合は管理者に連絡してください";
const SIGNIN_SERVER_ERROR_MESSAGE = SIGNIN_ERROR_MESSAGES.internal_error;

function formatRateLimitMessage(retryAfter: string | null): string {
	const seconds = retryAfter !== null ? Number(retryAfter) : Number.NaN;
	if (Number.isFinite(seconds) && seconds > 0) {
		const minutes = Math.ceil(seconds / 60);
		return `短時間に試行しすぎました。約 ${minutes} 分後に再度お試しください`;
	}
	return "短時間に試行しすぎました。しばらくしてから再度お試しください";
}

export function resolveSignupErrorMessage(input: {
	status: number;
	retryAfter: string | null;
	errorCode: unknown;
}): string {
	if (input.status === 429) {
		return formatRateLimitMessage(input.retryAfter);
	}

	if (
		typeof input.errorCode === "string" &&
		input.errorCode in SIGNUP_ERROR_MESSAGES
	) {
		return SIGNUP_ERROR_MESSAGES[input.errorCode];
	}

	if (input.status >= 500) {
		return SERVER_ERROR_MESSAGE;
	}

	return FALLBACK_MESSAGE;
}

export const CONFIRM_INVALID_INPUT_MESSAGE = "入力内容を確認してください";
export const CONFIRM_AUTH_FAILED_MESSAGE =
	"確認コードが正しくないか、有効期限が切れています。メールの最新コードを確認して再度お試しください";
export const CONFIRM_FALLBACK_MESSAGE =
	"確認に失敗しました。時間をおいて再度お試しください";

export function resolveSignInErrorMessage(input: {
	status: number;
	retryAfter: string | null;
	errorCode: unknown;
}): string {
	if (input.status === 429) {
		return formatRateLimitMessage(input.retryAfter);
	}

	if (
		typeof input.errorCode === "string" &&
		input.errorCode in SIGNIN_ERROR_MESSAGES
	) {
		return SIGNIN_ERROR_MESSAGES[input.errorCode];
	}

	if (input.status >= 500) {
		return SIGNIN_SERVER_ERROR_MESSAGE;
	}

	return SIGNIN_FALLBACK_MESSAGE;
}

export function resolveConfirmErrorMessage(input: {
	status: number;
	retryAfter: string | null;
	errorCode: unknown;
}): string {
	if (input.status === 429) {
		return formatRateLimitMessage(input.retryAfter);
	}

	if (input.errorCode === "invalid_input") return CONFIRM_INVALID_INPUT_MESSAGE;
	if (input.errorCode === "auth_failed") return CONFIRM_AUTH_FAILED_MESSAGE;
	return CONFIRM_FALLBACK_MESSAGE;
}

// Cognito SDK / PreSignUp Lambda が throw する例外を AppError に分類する。
//
// なぜ別ファイルに切り出すか:
//   - 旧 `lib/auth/errors.ts` は (1) error 分類 と (2) NextResponse 生成を
//     1 関数で行っていたため、HTTP 層が lib に漏れていた。
//   - 分類だけを純粋関数として切り出せば、HTTP 変換は wrapper の責務に閉じ、
//     `auth/__tests__/errors.test.ts` 相当の単体テストも HTTP に依存せず書ける。
//   - Cognito 例外名は SDK の実装詳細だが、ここで一度マップしてしまえば
//     呼び出し側 (Route Handler) は AppError 階層だけ見ればよい。

import {
	type AppError,
	InternalServerError,
	RateLimitedError,
	UpstreamUnavailableError,
	ValidationError,
} from "./app-error";

// 公開可能な認証失敗。これらはユーザーに「auth_failed」として一括で
// 返す方針。username の存在有無や password の形式まで詳細に返すと
// ユーザー列挙攻撃 (account enumeration) に繋がるため、わざと丸める。
const PUBLIC_COGNITO_AUTH_FAILURE_NAMES = new Set([
	"UsernameExistsException",
	"InvalidPasswordException",
	"CodeMismatchException",
	"ExpiredCodeException",
	"NotAuthorizedException",
	"UserNotConfirmedException",
	"UserNotFoundException",
]);

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getErrorName(error: unknown): string | undefined {
	// Error インスタンスかは別として "name" string プロパティだけ拾う。
	// Cognito SDK が独自のクラスを使うため instanceof では届かない。
	if (error instanceof Error && typeof error.name === "string") {
		return error.name;
	}
	if (isUnknownRecord(error) && typeof error.name === "string") {
		return error.name;
	}
	return undefined;
}

/**
 * Cognito 関連の例外を AppError へ変換する。Cognito 由来でない場合は null。
 *
 * 戻り値が null の場合、wrapper は generic `InternalServerError` にフォールバックする
 * (詳細はログに残し、レスポンスには出さない)。
 */
export function mapAuthErrorToAppError(error: unknown): AppError | null {
	const name = getErrorName(error);
	if (!name) return null;

	// PreSignUp Lambda が拒否した = 招待コード不正 / 無効。
	// "invite_validation_failed" は signup-error-messages.ts の文言マップキー。
	if (name === "UserLambdaValidationException") {
		return new ValidationError("invite_validation_failed");
	}

	// Cognito 自体のレートリミット。Retry-After は SDK が返さないため
	// 既存実装と同じ 120 秒固定 (ユーザー側の retry 抑制目的)。
	if (name === "TooManyRequestsException") {
		return new RateLimitedError(120);
	}

	// PreSignUp Lambda が落ちている / 応答不正。retry 可能。
	if (
		name === "UnexpectedLambdaException" ||
		name === "InvalidLambdaResponseException"
	) {
		return new UpstreamUnavailableError("invite_verification_unavailable");
	}

	// Cognito 自身の障害。retry 可能。
	if (name === "InternalErrorException" || name === "InternalServerException") {
		return new UpstreamUnavailableError("auth_upstream_unavailable");
	}

	// 構成不備 (UserPool / Client ID 間違い等)。これは bug なので 500 だが
	// ユーザーには "auth_configuration_error" と分けて返し、運営問い合わせ動線へ。
	if (
		name === "ResourceNotFoundException" ||
		name === "CredentialsProviderError"
	) {
		return new InternalServerError("auth_configuration_error", {
			cause: error,
		});
	}

	// SDK 側の入力検証失敗。これは business 層の入力 validation を
	// すり抜けた残余ケースなので "auth_failed" にまとめる。
	if (name === "InvalidParameterException") {
		return new ValidationError("auth_failed");
	}

	// 公開可能な認証失敗群を一律 "auth_failed" にまとめて
	// account enumeration を防ぐ。
	if (PUBLIC_COGNITO_AUTH_FAILURE_NAMES.has(name)) {
		return new ValidationError("auth_failed");
	}

	return null;
}

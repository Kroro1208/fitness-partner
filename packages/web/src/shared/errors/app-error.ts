// HTTP 境界 (Route Handler) でレスポンスに変換可能な業務エラーの基底。
//
// なぜ AppError 階層が必要か:
//   - 旧設計では `lib/auth/errors.ts` が NextResponse を直接返していた。
//     これはレイヤ規約違反 (lib に HTTP 層が漏れる) で、ユニットテストも
//     HTTP レスポンスを assert する形になっていた。
//   - AppError をドメイン層で throw し、`withRouteErrorHandling` wrapper が
//     最後に NextResponse へ変換することで、lib 層は HTTP に依存しない。
//
// 既存 envelope 互換性:
//   旧来 `{ error: "<kind>" }` 形式で返していたため、`publicErrorKind` を
//   各サブクラスに持たせ wrapper でそのまま body に詰める。
//   詳細情報を返す必要があるとき (Zod の field errors) は publicDetails を使う。

export abstract class AppError extends Error {
	abstract readonly status: number;
	abstract readonly publicErrorKind: string;

	// レート制限の Retry-After など、レスポンスに必須のヘッダー。
	readonly extraHeaders?: Record<string, string>;

	// 公開してよい詳細情報 (例: Zod の flatten 出力)。
	// stack trace / DB error / cause などは絶対に詰めない。
	readonly publicDetails?: unknown;

	constructor(message?: string, options?: { cause?: unknown }) {
		// new.target.name で具象クラス名 (NotFoundError など) をログに残す。
		super(message ?? new.target.name, options);
		this.name = new.target.name;
	}
}

// 入力検証 (Zod / 自前) の失敗。同じ 400 でも kind が複数 (invalid_input,
// invalid_body, invalid_json, invalid_content_length, auth_failed 相当) 必要なため
// kind を constructor で受ける。
export class ValidationError extends AppError {
	readonly status = 400;
	readonly publicErrorKind: string;
	readonly publicDetails?: unknown;

	constructor(kind = "invalid_input", details?: unknown) {
		super(kind);
		this.publicErrorKind = kind;
		this.publicDetails = details;
	}
}

// 認証失敗 (cookie 無効 / refresh token なし)。
// 401 と 403 を区別するため UnauthorizedError と ForbiddenError を分ける。
export class UnauthorizedError extends AppError {
	readonly status = 401;
	readonly publicErrorKind: string;

	constructor(kind = "unauthenticated") {
		super(kind);
		this.publicErrorKind = kind;
	}
}

// 認可失敗 / オリジン違反。CSRF 観点で「認証はあるが当該操作は禁止」を返す。
export class ForbiddenError extends AppError {
	readonly status = 403;
	readonly publicErrorKind: string;

	constructor(kind = "forbidden") {
		super(kind);
		this.publicErrorKind = kind;
	}
}

// 404。route 自体は存在するがリソースが無い、または proxy 許可リストに無い。
export class NotFoundError extends AppError {
	readonly status = 404;
	readonly publicErrorKind: string;

	constructor(kind = "not_found") {
		super(kind);
		this.publicErrorKind = kind;
	}
}

// payload too large。content-length / body 読み取りで上限超過した場合に throw。
export class PayloadTooLargeError extends AppError {
	readonly status = 413;
	readonly publicErrorKind = "payload_too_large";
}

// 429。Retry-After を必ず返す必要があるため extraHeaders に詰める。
// rateLimit の retry-after は変動値なので constructor で受け取る。
export class RateLimitedError extends AppError {
	readonly status = 429;
	readonly publicErrorKind = "rate_limited";
	readonly extraHeaders: Record<string, string>;

	constructor(retryAfterSeconds: number) {
		super("rate_limited");
		this.extraHeaders = {
			"Cache-Control": "no-store",
			"Retry-After": String(retryAfterSeconds),
		};
	}
}

// 502 / 503 相当。upstream (Cognito / API Gateway / LLM) が一時的に
// 応答できない場合。retry-able なので 5xx だがログしすぎないこと。
export class UpstreamUnavailableError extends AppError {
	readonly status = 503;
	readonly publicErrorKind: string;

	constructor(kind = "auth_upstream_unavailable") {
		super(kind);
		this.publicErrorKind = kind;
	}
}

// 設定不備や想定外バグ。これは観測必須なので wrapper でログを出す。
// cause を保持し、stack を辿れるようにする (レスポンスには出さない)。
export class InternalServerError extends AppError {
	readonly status = 500;
	readonly publicErrorKind: string;

	constructor(kind = "internal_error", options?: { cause?: unknown }) {
		super(kind, options);
		this.publicErrorKind = kind;
	}
}

export function isAppError(value: unknown): value is AppError {
	return value instanceof AppError;
}

// 同一オリジン / content-length のガード。
//
// なぜ Result / NextResponse を返さず throw に変えたか:
//   - 旧 API は `{ ok: true } | { ok: false; response: NextResponse }` を返し、
//     呼び出し側が `if (!ok) return ok.response;` を毎回書いていた。
//   - これは AP2 (lib に NextResponse が漏れる) 違反で、
//     かつ各 route.ts で同じ guard 解除パターンを散らす原因になっていた。
//   - throw + `withRouteErrorHandling` 集約に変えることで、
//     route handler 本体は「正常系 + 入力 schema parse」だけ書けばよくなる。
//
// throw する側の責任:
//   - AppError サブクラスを throw する (HTTP ステータスは AppError が持つ)
//   - 業務ロジックの一部とみなさない (副作用なし、idempotent)

import {
	ForbiddenError,
	PayloadTooLargeError,
	ValidationError,
} from "@/shared/errors/app-error";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 16 * 1024;
export const DEFAULT_PROXY_BODY_LIMIT_BYTES = 256 * 1024;

/**
 * 同一オリジンからのリクエストでなければ ForbiddenError を throw。
 *
 * - sec-fetch-site: cross-site が付いていれば即拒否
 * - origin が付いていれば request URL の origin と一致するか確認
 * - origin ヘッダーが無い場合 (server-to-server や非ブラウザ) は通す
 *
 * 呼び出しは `withRouteErrorHandling` 配下の Route Handler 内のみを想定。
 */
export function enforceSameOrigin(request: Request): void {
	if (request.headers.get("sec-fetch-site") === "cross-site") {
		throw new ForbiddenError("invalid_origin");
	}

	const origin = request.headers.get("origin");
	if (!origin) return;

	const requestUrl = new URL(request.url);
	if (origin !== requestUrl.origin) {
		throw new ForbiddenError("invalid_origin");
	}
}

/**
 * content-length が limitBytes を超える、または不正な値なら throw。
 *
 * - 不正な値 (NaN / 負数) は ValidationError("invalid_content_length")
 * - 上限超過は PayloadTooLargeError (413)
 * - content-length ヘッダーが無い場合は通す (chunked 等は呼び出し側が
 *   ストリーム側で別途上限を見る)
 */
export function enforceContentLength(
	request: Request,
	limitBytes: number,
): void {
	const raw = request.headers.get("content-length");
	if (!raw) return;

	const length = Number(raw);
	if (!Number.isFinite(length) || length < 0) {
		throw new ValidationError("invalid_content_length");
	}

	if (length > limitBytes) {
		throw new PayloadTooLargeError();
	}
}

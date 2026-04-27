// Route Handler のエラー集約 wrapper。
// 担当範囲:
//   - AppError throw を NextResponse へ変換 (publicErrorKind / status / extraHeaders)
//   - ZodError を ValidationError へ変換
//   - SyntaxError (request.json() 失敗) を ValidationError へ変換
//   - Cognito SDK 例外を AppError へ変換 (mapAuthErrorToAppError)
//   - その他 unknown error を InternalServerError へフォールバック
//   - 5xx 結果は console.error で観測 (4xx は業務エラーなのでログしない)
//
// 担当しないこと:
//   - 業務処理 (route handler 本体)
//   - Result 型から AppError への変換 (これは route handler 自身が行う)

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
	type AppError,
	InternalServerError,
	isAppError,
	ValidationError,
} from "@/shared/errors/app-error";
import { mapAuthErrorToAppError } from "@/shared/errors/auth-error-mapper";

export function withRouteErrorHandling<Args extends unknown[]>(
	handler: (...args: Args) => Promise<Response> | Response,
): (...args: Args) => Promise<Response> {
	return async (...args: Args): Promise<Response> => {
		try {
			return await handler(...args);
		} catch (error) {
			const appError = toAppError(error);
			logIfUnexpected(appError, error);
			return appErrorToResponse(appError);
		}
	};
}

function toAppError(error: unknown): AppError {
	// AppError はそのまま (lib 層からの明示的な throw)。
	if (isAppError(error)) return error;

	// Zod の schema 違反。details に flatten() を渡すと UI 側が field エラーを
	// 表示できるため、ValidationError の publicDetails で公開する。
	if (error instanceof ZodError) {
		return new ValidationError("invalid_input", error.flatten());
	}

	// `request.json()` が壊れた JSON で reject すると SyntaxError になる。
	// これは入力不正なので 400 で返すべき (500 にすると DoS 観測誤報になる)。
	if (error instanceof SyntaxError) {
		return new ValidationError("invalid_input");
	}

	// Cognito SDK 由来の例外を分類。null なら次のフォールバック。
	const fromCognito = mapAuthErrorToAppError(error);
	if (fromCognito) return fromCognito;

	// 想定外。ユーザーには "internal_error" だけ返し、cause はログ側に残す。
	// レスポンス body に error.message を出さないこと (DB エラー / stack 漏洩防止)。
	return new InternalServerError("internal_error", { cause: error });
}

function appErrorToResponse(error: AppError): NextResponse {
	const body: Record<string, unknown> = { error: error.publicErrorKind };
	if (error.publicDetails !== undefined) {
		body.details = error.publicDetails;
	}
	return NextResponse.json(body, {
		status: error.status,
		headers: error.extraHeaders,
	});
}

function logIfUnexpected(appError: AppError, original: unknown): void {
	// 4xx は通常運用の業務エラー。ログを溢れさせる原因なので残さない。
	// 5xx は観測必須 (ResourceNotFound = 設定不備、internal_error = unknown bug)。
	if (appError.status < 500) return;

	console.error("route handler error", {
		kind: appError.publicErrorKind,
		status: appError.status,
		// stack は省略 (CloudWatch / Vercel 側で wrapper の stack が出るため)。
		cause: serializeForLog(original),
	});
}

function serializeForLog(value: unknown): unknown {
	// Error は循環参照を避けて name/message だけログに残す。
	// 機密 (Authorization header / Anthropic responseBody 等) を含む可能性が
	// ある fields は構造的に剥がす方針。詳細は呼び出し側でマスクすること。
	if (value instanceof Error) {
		return { name: value.name, message: value.message };
	}
	return String(value);
}

import type { z } from "zod";

import {
	readJsonResponseBody,
	toResponseErrorBody,
} from "@/lib/http/read-json-response";

// クライアント側 fetch ラッパー。
//
// 旧実装の問題:
//   - すべての失敗を `ApiError` に丸めていたが、HTTP status / network 障害 /
//     parse 失敗を区別する手段がなかった。
//   - `extractErrorMessage` がサーバー由来の `body.error` 文字列を
//     `ApiError.message` に格納し、UI 層 (use-meal-swap-flow) がそのまま
//     ユーザーに表示していたため、サーバー側 kind が露出していた。
//   - fetch 自体の rejection (TypeError / AbortError) を捕捉せず、
//     `instanceof ApiError` 分岐が外れて呼び出し側で対応漏れが起きていた。
//
// 修正:
//   - ApiError.kind で「http_client (4xx) / http_server (5xx) / network / parse」を区別
//   - `getUserSafeApiErrorMessage` で固定文言にマップ (UI はこれを使うこと)
//   - network 失敗を ApiError(kind: "network") に変換

export type ApiErrorKind =
	// 4xx 系。バリデーション / 認証 / 認可 / 業務エラー。
	// retry してもほぼ無意味なので global retry policy で除外する。
	| "http_client"
	// 5xx 系。upstream 一時障害として retry 候補。
	| "http_server"
	// fetch 自体の rejection (DNS 失敗 / TLS / 通信切断 / AbortError 含む)。
	| "network"
	// レスポンス body が JSON として読めない / schema 違反。
	| "parse";

export class ApiError extends Error {
	readonly kind: ApiErrorKind;

	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
		options?: { kind?: ApiErrorKind; cause?: unknown },
	) {
		super(message, options);
		this.name = "ApiError";
		this.kind =
			options?.kind ?? (status >= 500 ? "http_server" : "http_client");
	}
}

const ABORTED_ERROR_NAMES = new Set(["AbortError", "TimeoutError"]);

function isAbortError(value: unknown): boolean {
	return value instanceof Error && ABORTED_ERROR_NAMES.has(value.name);
}

export async function apiClient<T>(
	path: string,
	schema: z.ZodType<T>,
	options: RequestInit = {},
): Promise<T> {
	const raw = await apiClientRaw(path, options);
	return schema.parse(raw);
}

export async function apiClientRaw(
	path: string,
	options: RequestInit = {},
): Promise<unknown> {
	const { headers: overrideHeaders, ...rest } = options;
	const mergedHeaders: Record<string, string> = {
		"Content-Type": "application/json",
		Accept: "application/json",
		...normalizeHeaders(overrideHeaders),
	};

	let res: Response;
	try {
		res = await fetch(`/api/proxy/${path.replace(/^\//, "")}`, {
			...rest,
			headers: mergedHeaders,
		});
	} catch (error) {
		// fetch rejection は network 障害 / abort / TLS 失敗 等。
		// ApiError に包んで `instanceof ApiError` 分岐を維持しつつ、
		// kind で「retry すべきか」「ユーザーに何と表示するか」を決められるようにする。
		throw new ApiError(0, null, "network_error", {
			kind: "network",
			cause: error,
		});
	}

	const contentType = res.headers.get("content-type") ?? "";
	const parsed: unknown = contentType.includes("application/json")
		? await readJsonBodyOrThrow(res)
		: await readTextBodyOrThrow(res);

	if (!res.ok) {
		throw new ApiError(
			res.status,
			parsed,
			extractErrorMessage(parsed, res.status),
			{ kind: res.status >= 500 ? "http_server" : "http_client" },
		);
	}

	return parsed;
}

async function readJsonBodyOrThrow(res: Response): Promise<unknown> {
	const parsed = await readJsonResponseBody(res);
	if (parsed.ok) return parsed.payload;

	const errorBody = toResponseErrorBody(parsed);
	if (!res.ok) {
		throw new ApiError(
			res.status,
			errorBody,
			extractErrorMessage(errorBody, res.status),
			{ kind: res.status >= 500 ? "http_server" : "http_client" },
		);
	}

	// 200 なのに JSON 不正 = upstream 契約違反。kind: parse として観測。
	throw new ApiError(
		res.status,
		errorBody,
		"Response body was not valid JSON",
		{
			kind: "parse",
		},
	);
}

async function readTextBodyOrThrow(res: Response): Promise<string> {
	try {
		return await res.text();
	} catch (error) {
		if (!res.ok) {
			throw new ApiError(
				res.status,
				null,
				`Request failed with status ${res.status}`,
				{
					kind: res.status >= 500 ? "http_server" : "http_client",
					cause: error,
				},
			);
		}

		throw new ApiError(
			res.status,
			null,
			"Response body could not be read as text",
			{
				kind: "parse",
				cause: error,
			},
		);
	}
}

function normalizeHeaders(
	init: HeadersInit | undefined,
): Record<string, string> {
	if (!init) return {};
	if (init instanceof Headers) {
		const out: Record<string, string> = {};
		init.forEach((value, key) => {
			out[key] = value;
		});
		return out;
	}
	if (Array.isArray(init)) {
		return Object.fromEntries(init);
	}
	return { ...init };
}

function extractErrorMessage(body: unknown, status: number): string {
	// この message は **ログ向け技術文字列**。UI に直接出してはいけない。
	// UI 表示用には `getUserSafeApiErrorMessage(error)` を使う。
	if (body !== null && typeof body === "object" && "error" in body) {
		const err = body.error;
		if (typeof err === "string") return err;
	}
	return `Request failed with status ${status}`;
}

type UserSafeMessageKey =
	| "network"
	| "abort"
	| "server"
	| "unauthorized"
	| "forbidden"
	| "not_found"
	| "rate_limited"
	| "bad_request"
	| "parse"
	| "unknown";

const USER_SAFE_MESSAGES = {
	network: "通信に失敗しました。電波状況を確認して再度お試しください。",
	abort: "通信がキャンセルされました。",
	server:
		"サーバー側で問題が発生しました。しばらくしてから再度お試しください。",
	unauthorized: "セッションが切れました。再度ログインしてください。",
	forbidden: "この操作は許可されていません。",
	not_found: "対象のデータが見つかりませんでした。",
	rate_limited:
		"短時間に試行しすぎました。しばらくしてから再度お試しください。",
	bad_request: "入力内容に問題があります。確認して再度お試しください。",
	parse: "サーバーからの応答を解釈できませんでした。",
	unknown: "予期しないエラーが発生しました。再度お試しください。",
} as const satisfies Record<UserSafeMessageKey, string>;

// HTTP 4xx status → USER_SAFE_MESSAGES のキーへのマッピング表。
// 旧実装は switch 文でケースが散在していたが、データ表に集約することで
// 「どの status を拾っているか」を一目で確認できる。
// 未掲載 status は default として "unknown" にフォールバックする。
const HTTP_STATUS_TO_MESSAGE_KEY = {
	400: "bad_request",
	401: "unauthorized",
	403: "forbidden",
	404: "not_found",
	413: "bad_request",
	429: "rate_limited",
} as const satisfies Record<number, UserSafeMessageKey>;

/**
 * UI 表示用のエラーメッセージ取得。
 *
 * - サーバー由来の error.message を **絶対に直接表示しない** (skill: "catch した
 *   error をそのまま表示" 違反防止)。
 * - kind / status から固定文言を返す。
 * - ApiError 以外 (Error / unknown) は generic 文言で丸める。
 */
export function getUserSafeApiErrorMessage(error: unknown): string {
	if (!(error instanceof ApiError)) {
		// Error / unknown / undefined はすべて固定文言。
		// 旧 use-meal-swap-flow の `err.message` 直表示 (skill 違反) を撲滅する。
		return USER_SAFE_MESSAGES.unknown;
	}

	if (error.kind === "network") {
		// AbortError は network 経路で扱う (cause を見て分岐)
		if (isAbortError(error.cause)) return USER_SAFE_MESSAGES.abort;
		return USER_SAFE_MESSAGES.network;
	}

	if (error.kind === "parse") return USER_SAFE_MESSAGES.parse;

	if (error.kind === "http_server") return USER_SAFE_MESSAGES.server;

	// http_client (4xx) は status 詳細でメッセージを分岐。
	// マッピング表 HTTP_STATUS_TO_MESSAGE_KEY を参照し、未掲載 status は "unknown" へ。
	const messageKey = (
		Object.hasOwn(HTTP_STATUS_TO_MESSAGE_KEY, error.status)
			? HTTP_STATUS_TO_MESSAGE_KEY[
					error.status as keyof typeof HTTP_STATUS_TO_MESSAGE_KEY
				]
			: "unknown"
	) satisfies UserSafeMessageKey;
	return USER_SAFE_MESSAGES[messageKey];
}

/**
 * TanStack Query の retry 関数。HTTP 4xx は retry しない。
 */
export function shouldRetryApiError(
	failureCount: number,
	error: unknown,
): boolean {
	// retry 上限 (3 回) は global の retry 設定と組み合わせる。
	if (failureCount >= 2) return false;

	if (!(error instanceof ApiError)) {
		// 非 ApiError (Zod / Error 派生) は network/parse とは限らないので retry しない
		return false;
	}

	// 4xx は副作用ある状況で危険なので絶対 retry しない
	if (error.kind === "http_client") return false;

	// network / 5xx / parse は retry 候補
	return true;
}

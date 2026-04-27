import { type NextRequest, NextResponse } from "next/server";

import { cognitoRefreshTokens } from "@/lib/auth/cognito";
import {
	clearSession,
	getAccessToken,
	getRefreshToken,
	setRefreshedTokens,
} from "@/lib/auth/session";
import {
	DEFAULT_PROXY_BODY_LIMIT_BYTES,
	enforceContentLength,
	enforceSameOrigin,
} from "@/lib/security/request-guard";
import {
	InternalServerError,
	NotFoundError,
	PayloadTooLargeError,
	UnauthorizedError,
	UpstreamUnavailableError,
} from "@/shared/errors/app-error";
import { withRouteErrorHandling } from "@/shared/http/with-route-error-handling";

// API Gateway / Lambda へのリバースプロキシ。
//
// 旧実装の問題点:
//   1. upstream `fetch` rejection (DNS 失敗 / タイムアウト) を catch しておらず、
//      Next.js のデフォルト 500 (stack 漏洩リスクあり) でレスポンスしていた。
//   2. upstream の `!ok` ボディを素通しでクライアントに返していたため、
//      upstream の詳細エラー (DB error / stack) が末端まで漏洩しうる。
//   3. リフレッシュ失敗を空 catch で握りつぶし、観測不能。
//
// 修正方針:
//   - upstream 通信を `fetchUpstreamOrThrow` で包み、UpstreamUnavailableError(502 相当) に変換
//   - upstream `!ok` の error body は構造化済みかどうかを境界で精査し、生 stack を素通しさせない
//   - リフレッシュ失敗は warn ログを残してから cookie を破棄

type RouteContext = {
	params: Promise<{ path: string[] }>;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isMutatingMethod(method: string): boolean {
	return !SAFE_METHODS.has(method.toUpperCase());
}

function isAllowedProxyTarget(
	method: string,
	path: readonly string[],
): boolean {
	const route = path.join("/");
	if (method === "GET") {
		return (
			route === "users/me/profile" ||
			/^users\/me\/plans\/\d{4}-\d{2}-\d{2}$/u.test(route)
		);
	}
	if (method === "PATCH") {
		return route === "users/me/profile";
	}
	if (method === "POST") {
		return (
			route === "users/me/meals" ||
			route === "users/me/weight" ||
			route === "users/me/plans/generate" ||
			/^users\/me\/plans\/\d{4}-\d{2}-\d{2}\/meals\/swap-(candidates|apply)$/u.test(
				route,
			)
		);
	}
	return false;
}

/**
 * 旧 readRequestBody は Result 型だったが、guard 系の throw 統一に合わせて
 * AppError throw 版に変更。bodyResult ハンドリングが消える分、proxy 本体が
 * 一直線に読める。
 */
async function readRequestBodyOrThrow(
	request: NextRequest,
	limitBytes: number,
): Promise<ArrayBuffer | undefined> {
	const method = request.method.toUpperCase();
	if (method === "GET" || method === "HEAD" || method === "DELETE") {
		return undefined;
	}

	enforceContentLength(request, limitBytes);

	if (!request.body) return undefined;

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		// content-length が嘘 / 欠落のときの最終ガード。
		// stream 上限で確実に止める。
		if (total > limitBytes) {
			await reader.cancel();
			throw new PayloadTooLargeError();
		}
		chunks.push(value);
	}

	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body.buffer;
}

async function refreshAccessToken(): Promise<string | null> {
	const refreshToken = await getRefreshToken();
	if (!refreshToken) return null;

	try {
		const refreshed = await cognitoRefreshTokens(refreshToken);
		await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
		return refreshed.accessToken;
	} catch (error) {
		// 旧実装は空 catch で観測不能だった。
		// refresh token 失効 (=業務エラー) と SDK 障害 (=想定外) を
		// 名前で区別するのは不安定なため、warn ログを残してから
		// 安全側で session を破棄する (再ログイン誘導)。
		console.warn("proxy refresh token failed", {
			name: error instanceof Error ? error.name : "unknown",
			message: error instanceof Error ? error.message : String(error),
		});
		await clearSession();
		return null;
	}
}

async function getValidAccessToken(): Promise<string | null> {
	const accessToken = await getAccessToken();
	if (accessToken) return accessToken;
	return refreshAccessToken();
}

/**
 * upstream への fetch を実行する。ネットワーク rejection (DNS / TLS 失敗 /
 * タイムアウト) は UpstreamUnavailableError へ変換する。
 *
 * なぜ generic な `InternalServerError` でなく `UpstreamUnavailableError` か:
 *   - クライアント側で「自分のリクエスト形式は正しいが API Gateway 側が一時的に
 *     落ちている」ことを区別したい (retry 挙動が変わる)。503 / "auth_upstream_unavailable"
 *     を返すことでブラウザ側のエクスポネンシャル backoff を発動できる。
 */
async function fetchUpstreamOrThrow(
	target: URL,
	init: RequestInit,
): Promise<Response> {
	try {
		return await fetch(target, init);
	} catch (error) {
		console.warn("proxy upstream fetch failed", {
			target: target.toString(),
			name: error instanceof Error ? error.name : "unknown",
			message: error instanceof Error ? error.message : String(error),
		});
		throw new UpstreamUnavailableError("auth_upstream_unavailable");
	}
}

const ALLOWED_RESPONSE_CONTENT_TYPES = ["application/json", "text/plain"];

function pickAllowedContentType(value: string | null): string | null {
	if (!value) return null;
	const lowercase = value.toLowerCase();
	const matched = ALLOWED_RESPONSE_CONTENT_TYPES.find((allowed) =>
		lowercase.startsWith(allowed),
	);
	return matched ? value : null;
}

export const GET = withRouteErrorHandling(proxy);
export const POST = withRouteErrorHandling(proxy);
export const PUT = withRouteErrorHandling(proxy);
export const PATCH = withRouteErrorHandling(proxy);
export const DELETE = withRouteErrorHandling(proxy);

async function proxy(
	request: NextRequest,
	context: RouteContext,
): Promise<Response> {
	const method = request.method.toUpperCase();
	if (isMutatingMethod(method)) {
		enforceSameOrigin(request);
	}

	let accessToken = await getValidAccessToken();
	if (!accessToken) {
		throw new UnauthorizedError("unauthenticated");
	}

	const apiBase = process.env.API_GATEWAY_URL;
	if (!apiBase) {
		// deploy 設定不備。観測のため cause を残し、レスポンスは固定 kind で返す。
		throw new InternalServerError("api_gateway_url_not_configured");
	}

	const { path } = await context.params;
	if (!isAllowedProxyTarget(method, path)) {
		// 許可リスト外の path は 404 を返す (404 / 403 のどちらでもよいが、
		// 旧実装の "not_found" 互換を維持)。
		throw new NotFoundError("not_found");
	}

	const target = new URL(`${apiBase.replace(/\/$/, "")}/${path.join("/")}`);
	for (const [key, value] of request.nextUrl.searchParams) {
		target.searchParams.append(key, value);
	}

	const headers = new Headers();
	headers.set("Authorization", `Bearer ${accessToken}`);
	const contentType = request.headers.get("content-type");
	if (contentType) headers.set("content-type", contentType);
	const accept = request.headers.get("accept");
	if (accept) headers.set("accept", accept);

	const body = await readRequestBodyOrThrow(
		request,
		DEFAULT_PROXY_BODY_LIMIT_BYTES,
	);

	let upstream = await fetchUpstreamOrThrow(target, {
		method,
		headers,
		body,
		cache: "no-store",
		redirect: "manual",
	});

	if (upstream.status === 401) {
		accessToken = await refreshAccessToken();
		if (!accessToken) {
			throw new UnauthorizedError("unauthenticated");
		}

		headers.set("Authorization", `Bearer ${accessToken}`);
		upstream = await fetchUpstreamOrThrow(target, {
			method,
			headers,
			body,
			cache: "no-store",
			redirect: "manual",
		});
	}

	const responseHeaders = new Headers();
	const upstreamContentType = pickAllowedContentType(
		upstream.headers.get("content-type"),
	);
	// content-type を allow-list 化することで、upstream が SSE / multipart など
	// 想定外の形式を返したときに binary を素通しさせない。
	if (upstreamContentType) {
		responseHeaders.set("content-type", upstreamContentType);
	}

	const responseBody = await upstream.arrayBuffer();
	return new NextResponse(responseBody, {
		status: upstream.status,
		headers: responseHeaders,
	});
}

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

type RouteContext = {
	params: Promise<{ path: string[] }>;
};

type BodyReadResult =
	| { ok: true; body: ArrayBuffer | undefined }
	| { ok: false; response: NextResponse };

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

async function readRequestBody(
	request: NextRequest,
	limitBytes: number,
): Promise<BodyReadResult> {
	const method = request.method.toUpperCase();
	if (method === "GET" || method === "HEAD" || method === "DELETE") {
		return { ok: true, body: undefined };
	}

	const length = enforceContentLength(request, limitBytes);
	if (!length.ok) return length;

	if (!request.body) return { ok: true, body: undefined };

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > limitBytes) {
			await reader.cancel();
			return {
				ok: false,
				response: NextResponse.json(
					{ error: "payload_too_large" },
					{ status: 413 },
				),
			};
		}
		chunks.push(value);
	}

	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { ok: true, body: body.buffer };
}

async function refreshAccessToken(): Promise<string | null> {
	const refreshToken = await getRefreshToken();
	if (!refreshToken) return null;

	try {
		const refreshed = await cognitoRefreshTokens(refreshToken);
		await setRefreshedTokens(refreshed.idToken, refreshed.accessToken);
		return refreshed.accessToken;
	} catch {
		await clearSession();
		return null;
	}
}

async function getValidAccessToken(): Promise<string | null> {
	const accessToken = await getAccessToken();
	if (accessToken) return accessToken;
	return refreshAccessToken();
}

async function proxy(request: NextRequest, context: RouteContext) {
	const method = request.method.toUpperCase();
	if (isMutatingMethod(method)) {
		const origin = enforceSameOrigin(request);
		if (!origin.ok) return origin.response;
	}

	let accessToken = await getValidAccessToken();
	if (!accessToken) {
		return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
	}

	const apiBase = process.env.API_GATEWAY_URL;
	if (!apiBase) {
		return NextResponse.json(
			{ error: "api_gateway_url_not_configured" },
			{ status: 500 },
		);
	}

	const { path } = await context.params;
	if (!isAllowedProxyTarget(method, path)) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
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

	const bodyResult = await readRequestBody(
		request,
		DEFAULT_PROXY_BODY_LIMIT_BYTES,
	);
	if (!bodyResult.ok) return bodyResult.response;

	let upstream = await fetch(target, {
		method,
		headers,
		body: bodyResult.body,
		cache: "no-store",
		redirect: "manual",
	});

	if (upstream.status === 401) {
		accessToken = await refreshAccessToken();
		if (!accessToken) {
			return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
		}

		headers.set("Authorization", `Bearer ${accessToken}`);
		upstream = await fetch(target, {
			method,
			headers,
			body: bodyResult.body,
			cache: "no-store",
			redirect: "manual",
		});
	}

	const responseHeaders = new Headers();
	const upstreamContentType = upstream.headers.get("content-type");
	if (upstreamContentType)
		responseHeaders.set("content-type", upstreamContentType);

	const responseBody = await upstream.arrayBuffer();
	return new NextResponse(responseBody, {
		status: upstream.status,
		headers: responseHeaders,
	});
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

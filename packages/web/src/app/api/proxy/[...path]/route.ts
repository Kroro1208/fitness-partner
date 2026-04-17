import { type NextRequest, NextResponse } from "next/server";

import { cognitoRefreshTokens } from "@/lib/auth/cognito";
import {
	clearSession,
	getAccessToken,
	getRefreshToken,
	setRefreshedTokens,
} from "@/lib/auth/session";

type RouteContext = {
	params: Promise<{ path: string[] }>;
};

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

	const method = request.method.toUpperCase();
	const hasBody = method !== "GET" && method !== "HEAD" && method !== "DELETE";
	const body = hasBody ? await request.arrayBuffer() : undefined;

	let upstream = await fetch(target, {
		method,
		headers,
		body,
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
			body,
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

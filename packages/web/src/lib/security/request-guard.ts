import { NextResponse } from "next/server";

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 16 * 1024;
export const DEFAULT_PROXY_BODY_LIMIT_BYTES = 256 * 1024;

type GuardResult = { ok: true } | { ok: false; response: NextResponse };

export function enforceSameOrigin(request: Request): GuardResult {
	if (request.headers.get("sec-fetch-site") === "cross-site") {
		return {
			ok: false,
			response: NextResponse.json({ error: "invalid_origin" }, { status: 403 }),
		};
	}

	const origin = request.headers.get("origin");
	if (!origin) return { ok: true };

	const requestUrl = new URL(request.url);
	if (origin !== requestUrl.origin) {
		return {
			ok: false,
			response: NextResponse.json({ error: "invalid_origin" }, { status: 403 }),
		};
	}

	return { ok: true };
}

export function enforceContentLength(
	request: Request,
	limitBytes: number,
): GuardResult {
	const raw = request.headers.get("content-length");
	if (!raw) return { ok: true };

	const length = Number(raw);
	if (!Number.isFinite(length) || length < 0) {
		return {
			ok: false,
			response: NextResponse.json(
				{ error: "invalid_content_length" },
				{ status: 400 },
			),
		};
	}

	if (length > limitBytes) {
		return {
			ok: false,
			response: NextResponse.json(
				{ error: "payload_too_large" },
				{ status: 413 },
			),
		};
	}

	return { ok: true };
}

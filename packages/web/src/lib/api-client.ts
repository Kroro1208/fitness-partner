import type { z } from "zod";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly body: unknown,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
	}
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
	const res = await fetch(`/api/proxy/${path.replace(/^\//, "")}`, {
		...rest,
		headers: mergedHeaders,
	});

	const contentType = res.headers.get("content-type") ?? "";
	const parsed: unknown = contentType.includes("application/json")
		? await res.json().catch(() => null)
		: await res.text().catch(() => "");

	if (!res.ok) {
		throw new ApiError(
			res.status,
			parsed,
			extractErrorMessage(parsed, res.status),
		);
	}

	return parsed;
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
	if (body !== null && typeof body === "object" && "error" in body) {
		const err = body.error;
		if (typeof err === "string") return err;
	}
	return `Request failed with status ${status}`;
}

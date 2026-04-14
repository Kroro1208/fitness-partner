import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

const JSON_HEADERS: Readonly<Record<string, string>> = {
	"Content-Type": "application/json",
};

export function ok(body: unknown): APIGatewayProxyStructuredResultV2 {
	return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export function badRequest(message: string): APIGatewayProxyStructuredResultV2 {
	return {
		statusCode: 400,
		headers: JSON_HEADERS,
		body: JSON.stringify({ message }),
	};
}

export function unauthorized(): APIGatewayProxyStructuredResultV2 {
	return {
		statusCode: 401,
		headers: JSON_HEADERS,
		body: JSON.stringify({ message: "Unauthorized" }),
	};
}

export function notFound(): APIGatewayProxyStructuredResultV2 {
	return {
		statusCode: 404,
		headers: JSON_HEADERS,
		body: JSON.stringify({ message: "Not found" }),
	};
}

export function serverError(): APIGatewayProxyStructuredResultV2 {
	return {
		statusCode: 500,
		headers: JSON_HEADERS,
		body: JSON.stringify({ message: "Internal server error" }),
	};
}

type ParseJsonBodyResult =
	| { ok: true; body: unknown }
	| { ok: false; reason: "missing_body" | "invalid_json" };

type RequireJsonBodyResult =
	| { ok: true; body: unknown }
	| { ok: false; response: APIGatewayProxyStructuredResultV2 };

/**
 * リクエストボディを JSON パースする。
 * body 未送信と JSON 壊れを別 reason で返す。
 */
export function parseJsonBody(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): ParseJsonBodyResult {
	if (!event.body) {
		return { ok: false, reason: "missing_body" };
	}
	const raw = event.isBase64Encoded
		? Buffer.from(event.body, "base64").toString("utf-8")
		: event.body;
	try {
		return { ok: true, body: JSON.parse(raw) };
	} catch {
		return { ok: false, reason: "invalid_json" };
	}
}

export function requireJsonBody(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): RequireJsonBodyResult {
	const parsed = parseJsonBody(event);
	if (!parsed.ok) {
		return {
			ok: false,
			response:
				parsed.reason === "missing_body"
					? badRequest("Request body is required")
					: badRequest("Request body must be valid JSON"),
		};
	}
	return parsed;
}

export async function withServerError(
	label: string,
	work: () => Promise<APIGatewayProxyStructuredResultV2>,
): Promise<APIGatewayProxyStructuredResultV2> {
	try {
		return await work();
	} catch (error) {
		console.error(`${label} error:`, error);
		return serverError();
	}
}

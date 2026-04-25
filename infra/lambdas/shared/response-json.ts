import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

const JSON_HEADERS: Readonly<Record<string, string>> = {
	"Content-Type": "application/json",
};

/**
 * 構造化エラー JSON レスポンス helper。
 * `response.ts` の `badRequest(message)` は `{ message }` を返すのに対し、
 * こちらは任意の body を許容する（`{ error: "code" }` のような error code 返却用）。
 */
export function errorJson(
	statusCode: number,
	body: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
	return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export const badRequestJson = (body: Record<string, unknown>) =>
	errorJson(400, body);
export const badGatewayJson = (body: Record<string, unknown>) =>
	errorJson(502, body);
export const gatewayTimeoutJson = (body: Record<string, unknown>) =>
	errorJson(504, body);
export function rateLimitedJson(retryAfterSeconds: number) {
	return {
		statusCode: 429,
		headers: {
			"Content-Type": "application/json",
			"Retry-After": String(retryAfterSeconds),
		},
		body: JSON.stringify({ error: "rate_limited" }),
	};
}

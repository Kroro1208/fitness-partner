import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";

/**
 * Lambda テスト用のイベントビルダー。
 * 必須フィールドにデフォルト値を入れ、テスト側は差分だけ指定する。
 *
 * noAuth: true の場合、authorizer に空の claims (sub なし) を設定する。
 * @types/aws-lambda は authorizer を required にしているため、
 * undefined を渡すと型エラーになる。代わりに claims を空にすることで
 * getUserId が { ok: false } を返す経路を型安全にテストする。
 */
export function makeEvent(overrides: {
	method?: string;
	path?: string;
	pathParameters?: Record<string, string>;
	body?: string;
	sub?: string;
	noAuth?: boolean;
}): APIGatewayProxyEventV2WithJWTAuthorizer {
	const method = overrides.method ?? "GET";
	const path = overrides.path ?? "/";
	const sub = overrides.sub ?? "user-123";

	return {
		version: "2.0",
		routeKey: `${method} ${path}`,
		rawPath: path,
		rawQueryString: "",
		headers: {},
		requestContext: {
			accountId: "123456789012",
			apiId: "test-api",
			authorizer: {
				principalId: overrides.noAuth ? "" : sub,
				integrationLatency: 0,
				jwt: {
					claims: overrides.noAuth ? {} : { sub },
					scopes: [],
				},
			},
			domainName: "test.execute-api.us-east-1.amazonaws.com",
			domainPrefix: "test",
			http: {
				method,
				path,
				protocol: "HTTP/1.1",
				sourceIp: "127.0.0.1",
				userAgent: "test",
			},
			requestId: "test-request-id",
			routeKey: `${method} ${path}`,
			stage: "$default",
			time: "13/Apr/2026:00:00:00 +0000",
			timeEpoch: 1776211200000,
		},
		pathParameters: overrides.pathParameters,
		body: overrides.body,
		isBase64Encoded: false,
	};
}

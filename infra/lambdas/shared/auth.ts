import type {
	APIGatewayProxyEventV2WithJWTAuthorizer,
	APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { unauthorized } from "./response";
import { toUserId, type UserId } from "./types";

type AuthResult = { ok: true; userId: UserId } | { ok: false };
type RequireUserResult =
	| { ok: true; userId: UserId }
	| { ok: false; response: APIGatewayProxyStructuredResultV2 };

/**
 * JWT claims から Cognito sub (ユーザーID) を抽出する。
 * API Gateway の JWT Authorizer が検証済みの claims を渡す前提。
 * 例外ではなく Result 型で返す (呼び出し側の try-catch を排除)。
 */
export function getUserId(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): AuthResult {
	const sub = event.requestContext.authorizer?.jwt?.claims?.sub;
	if (typeof sub !== "string" || sub.length === 0) {
		return { ok: false };
	}
	return { ok: true, userId: toUserId(sub) };
}

export function requireUserId(
	event: APIGatewayProxyEventV2WithJWTAuthorizer,
): RequireUserResult {
	const auth = getUserId(event);
	if (!auth.ok) {
		return { ok: false, response: unauthorized() };
	}
	return auth;
}

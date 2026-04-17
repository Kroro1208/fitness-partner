import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

const COGNITO_ERROR_MAP = {
	UsernameExistsException: { error: "username_exists", status: 409 },
	InvalidPasswordException: { error: "invalid_password", status: 400 },
	CodeMismatchException: { error: "code_mismatch", status: 400 },
	ExpiredCodeException: { error: "expired_code", status: 400 },
	NotAuthorizedException: { error: "not_authorized", status: 401 },
	UserNotConfirmedException: { error: "user_not_confirmed", status: 403 },
	UserNotFoundException: { error: "user_not_found", status: 404 },
} as const satisfies Record<string, { error: string; status: number }>;

type CognitoErrorName = keyof typeof COGNITO_ERROR_MAP;

function isCognitoErrorName(name: string): name is CognitoErrorName {
	return Object.hasOwn(COGNITO_ERROR_MAP, name);
}

export function handleAuthError(error: unknown): NextResponse {
	if (error instanceof ZodError) {
		return NextResponse.json(
			{ error: "invalid_input", details: error.flatten() },
			{ status: 400 },
		);
	}

	const name =
		error instanceof Error && typeof error.name === "string"
			? error.name
			: undefined;

	if (name !== undefined && isCognitoErrorName(name)) {
		const mapped = COGNITO_ERROR_MAP[name];
		return NextResponse.json(
			{ error: mapped.error },
			{ status: mapped.status },
		);
	}

	console.error("auth error", { name });
	return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

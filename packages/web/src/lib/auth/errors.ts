import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

const COGNITO_PUBLIC_ERROR_NAMES = new Set([
	"UsernameExistsException",
	"InvalidPasswordException",
	"CodeMismatchException",
	"ExpiredCodeException",
	"NotAuthorizedException",
	"UserNotConfirmedException",
	"UserNotFoundException",
]);

function isPublicCognitoError(name: string): boolean {
	return COGNITO_PUBLIC_ERROR_NAMES.has(name);
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

	if (name !== undefined && isPublicCognitoError(name)) {
		return NextResponse.json({ error: "auth_failed" }, { status: 400 });
	}

	console.error("auth error", { name });
	return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

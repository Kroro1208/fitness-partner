import "server-only";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { rateLimitedResponse } from "@/lib/security/rate-limit";

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

function getErrorName(error: unknown): string | undefined {
	if (error instanceof Error && typeof error.name === "string") {
		return error.name;
	}
	if (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		typeof (error as { name: unknown }).name === "string"
	) {
		return (error as { name: string }).name;
	}
	return undefined;
}

export function handleAuthError(error: unknown): NextResponse {
	if (error instanceof ZodError) {
		return NextResponse.json(
			{ error: "invalid_input", details: error.flatten() },
			{ status: 400 },
		);
	}

	if (error instanceof SyntaxError) {
		return NextResponse.json({ error: "invalid_input" }, { status: 400 });
	}

	const name = getErrorName(error);

	if (name === "UserLambdaValidationException") {
		// PreSignUp 等の Lambda が throw した内容は Cognito がこの名前で返す
		return NextResponse.json(
			{ error: "invite_validation_failed" },
			{ status: 400 },
		);
	}

	if (name === "TooManyRequestsException") {
		return rateLimitedResponse(120);
	}

	if (
		name === "UnexpectedLambdaException" ||
		name === "InvalidLambdaResponseException"
	) {
		return NextResponse.json(
			{ error: "invite_verification_unavailable" },
			{ status: 503 },
		);
	}

	if (name === "InternalErrorException" || name === "InternalServerException") {
		return NextResponse.json(
			{ error: "auth_upstream_unavailable" },
			{ status: 503 },
		);
	}

	if (name === "InvalidParameterException") {
		return NextResponse.json({ error: "auth_failed" }, { status: 400 });
	}

	if (name === "ResourceNotFoundException") {
		console.error("auth error", {
			name,
			message: error instanceof Error ? error.message : String(error),
		});
		return NextResponse.json(
			{ error: "auth_configuration_error" },
			{ status: 500 },
		);
	}

	if (name === "CredentialsProviderError") {
		console.error("auth error", {
			name,
			message: error instanceof Error ? error.message : String(error),
		});
		return NextResponse.json(
			{ error: "auth_configuration_error" },
			{ status: 500 },
		);
	}

	if (name !== undefined && isPublicCognitoError(name)) {
		return NextResponse.json({ error: "auth_failed" }, { status: 400 });
	}

	console.error("auth error", {
		name,
		message: error instanceof Error ? error.message : String(error),
	});
	return NextResponse.json({ error: "internal_error" }, { status: 500 });
}

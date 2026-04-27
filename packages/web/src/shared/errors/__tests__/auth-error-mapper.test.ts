// Cognito SDK 例外を AppError に分類する純粋関数のテスト。
// HTTP レスポンス変換は wrapper の責務なので、ここでは AppError サブクラスと
// publicErrorKind / status の組み合わせだけを assert する。

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
	InternalServerError,
	RateLimitedError,
	UpstreamUnavailableError,
	ValidationError,
} from "../app-error";
import { mapAuthErrorToAppError } from "../auth-error-mapper";

class CognitoLikeError extends Error {
	constructor(name: string) {
		super(name);
		this.name = name;
	}
}

describe("mapAuthErrorToAppError", () => {
	it("UsernameExistsException は ValidationError(auth_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("UsernameExistsException"),
		);
		expect(result).toBeInstanceOf(ValidationError);
		expect(result?.publicErrorKind).toBe("auth_failed");
		expect(result?.status).toBe(400);
	});

	it("InvalidPasswordException は ValidationError(auth_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("InvalidPasswordException"),
		);
		expect(result?.publicErrorKind).toBe("auth_failed");
		expect(result?.status).toBe(400);
	});

	it("CodeMismatchException は ValidationError(auth_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("CodeMismatchException"),
		);
		expect(result?.publicErrorKind).toBe("auth_failed");
	});

	it("ExpiredCodeException は ValidationError(auth_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("ExpiredCodeException"),
		);
		expect(result?.publicErrorKind).toBe("auth_failed");
	});

	it("NotAuthorizedException は ValidationError(auth_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("NotAuthorizedException"),
		);
		expect(result?.publicErrorKind).toBe("auth_failed");
	});

	it("UserNotConfirmedException は ValidationError(auth_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("UserNotConfirmedException"),
		);
		expect(result?.publicErrorKind).toBe("auth_failed");
	});

	it("UserNotFoundException は ValidationError(auth_failed)", () => {
		// account enumeration 防止のため、user not found も generic な auth_failed に丸める
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("UserNotFoundException"),
		);
		expect(result?.publicErrorKind).toBe("auth_failed");
	});

	it("UserLambdaValidationException は ValidationError(invite_validation_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("UserLambdaValidationException"),
		);
		expect(result).toBeInstanceOf(ValidationError);
		expect(result?.publicErrorKind).toBe("invite_validation_failed");
		expect(result?.status).toBe(400);
	});

	it("TooManyRequestsException は RateLimitedError(120s)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("TooManyRequestsException"),
		);
		expect(result).toBeInstanceOf(RateLimitedError);
		expect(result?.status).toBe(429);
		expect(result?.extraHeaders?.["Retry-After"]).toBe("120");
	});

	it("UnexpectedLambdaException は UpstreamUnavailableError(invite_verification_unavailable)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("UnexpectedLambdaException"),
		);
		expect(result).toBeInstanceOf(UpstreamUnavailableError);
		expect(result?.publicErrorKind).toBe("invite_verification_unavailable");
		expect(result?.status).toBe(503);
	});

	it("InvalidLambdaResponseException も invite_verification_unavailable", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("InvalidLambdaResponseException"),
		);
		expect(result?.publicErrorKind).toBe("invite_verification_unavailable");
	});

	it("InternalErrorException は UpstreamUnavailableError(auth_upstream_unavailable)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("InternalErrorException"),
		);
		expect(result).toBeInstanceOf(UpstreamUnavailableError);
		expect(result?.publicErrorKind).toBe("auth_upstream_unavailable");
	});

	it("InvalidParameterException は ValidationError(auth_failed)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("InvalidParameterException"),
		);
		expect(result?.publicErrorKind).toBe("auth_failed");
	});

	it("ResourceNotFoundException は InternalServerError(auth_configuration_error)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("ResourceNotFoundException"),
		);
		expect(result).toBeInstanceOf(InternalServerError);
		expect(result?.publicErrorKind).toBe("auth_configuration_error");
		expect(result?.status).toBe(500);
	});

	it("CredentialsProviderError は InternalServerError(auth_configuration_error)", () => {
		const result = mapAuthErrorToAppError(
			new CognitoLikeError("CredentialsProviderError"),
		);
		expect(result?.publicErrorKind).toBe("auth_configuration_error");
	});

	it("Cognito 由来でない Error は null (= generic internal_error にフォールバック)", () => {
		expect(mapAuthErrorToAppError(new Error("unrelated"))).toBeNull();
	});

	it("ZodError は wrapper 側で扱うので mapper は null を返す", () => {
		const err = (() => {
			try {
				z.object({ x: z.string() }).parse({});
			} catch (e) {
				return e;
			}
		})();
		expect(mapAuthErrorToAppError(err)).toBeNull();
	});

	it("Error 以外の値 (string / null) も null", () => {
		expect(mapAuthErrorToAppError("plain string")).toBeNull();
		expect(mapAuthErrorToAppError(null)).toBeNull();
	});
});

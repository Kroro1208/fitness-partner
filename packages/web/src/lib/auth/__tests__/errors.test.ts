import { describe, expect, it } from "vitest";
import { z } from "zod";

import { handleAuthError } from "../errors";

class CognitoLikeError extends Error {
	constructor(name: string) {
		super(name);
		this.name = name;
	}
}

async function asJson(
	res: Response,
): Promise<{ status: number; body: unknown }> {
	return { status: res.status, body: await res.json() };
}

describe("handleAuthError", () => {
	it("ZodError は 400 と invalid_input エラーコードを返す", async () => {
		const err = (() => {
			try {
				z.object({ x: z.string() }).parse({});
			} catch (e) {
				return e;
			}
		})();

		const { status, body } = await asJson(handleAuthError(err));

		expect(status).toBe(400);
		expect(body).toMatchObject({ error: "invalid_input" });
	});

	it("UsernameExistsException は 409 username_exists を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new CognitoLikeError("UsernameExistsException")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: "auth_failed" });
	});

	it("InvalidPasswordException は 400 invalid_password を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new CognitoLikeError("InvalidPasswordException")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: "auth_failed" });
	});

	it("CodeMismatchException は 400 code_mismatch を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new CognitoLikeError("CodeMismatchException")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: "auth_failed" });
	});

	it("ExpiredCodeException は 400 expired_code を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new CognitoLikeError("ExpiredCodeException")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: "auth_failed" });
	});

	it("NotAuthorizedException は 401 not_authorized を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new CognitoLikeError("NotAuthorizedException")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: "auth_failed" });
	});

	it("UserNotConfirmedException は 403 user_not_confirmed を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new CognitoLikeError("UserNotConfirmedException")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: "auth_failed" });
	});

	it("UserNotFoundException は 404 user_not_found を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new CognitoLikeError("UserNotFoundException")),
		);
		expect(status).toBe(400);
		expect(body).toEqual({ error: "auth_failed" });
	});

	it("未知の Error は 500 internal_error を返す", async () => {
		const { status, body } = await asJson(
			handleAuthError(new Error("something bad")),
		);
		expect(status).toBe(500);
		expect(body).toEqual({ error: "internal_error" });
	});

	it("Error 以外の値（string / null）でも 500 internal_error を返す", async () => {
		const a = await asJson(handleAuthError("plain string"));
		const b = await asJson(handleAuthError(null));
		expect(a.status).toBe(500);
		expect(a.body).toEqual({ error: "internal_error" });
		expect(b.status).toBe(500);
		expect(b.body).toEqual({ error: "internal_error" });
	});
});

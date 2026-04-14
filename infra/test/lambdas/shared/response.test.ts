import { describe, expect, it } from "vitest";
import {
	badRequest,
	notFound,
	ok,
	parseJsonBody,
	requireJsonBody,
	serverError,
	unauthorized,
	withServerError,
} from "../../../lambdas/shared/response";
import { makeEvent } from "../helpers/api-event";

describe("response helpers", () => {
	it("ok returns 200 with JSON body", () => {
		const result = ok({ data: "test" });
		expect(result.statusCode).toBe(200);
		expect(JSON.parse(String(result.body))).toEqual({ data: "test" });
		expect(result.headers).toEqual({ "Content-Type": "application/json" });
	});

	it("badRequest returns 400 with message", () => {
		const result = badRequest("invalid input");
		expect(result.statusCode).toBe(400);
		expect(JSON.parse(String(result.body))).toEqual({
			message: "invalid input",
		});
	});

	it("unauthorized returns 401", () => {
		const result = unauthorized();
		expect(result.statusCode).toBe(401);
		expect(JSON.parse(String(result.body))).toEqual({
			message: "Unauthorized",
		});
	});

	it("notFound returns 404", () => {
		const result = notFound();
		expect(result.statusCode).toBe(404);
		expect(JSON.parse(String(result.body))).toEqual({ message: "Not found" });
	});

	it("serverError returns 500 without internal details", () => {
		const result = serverError();
		expect(result.statusCode).toBe(500);
		expect(JSON.parse(String(result.body))).toEqual({
			message: "Internal server error",
		});
	});
});

describe("parseJsonBody", () => {
	it("parses valid JSON body", () => {
		const event = makeEvent({ body: JSON.stringify({ name: "test" }) });
		expect(parseJsonBody(event)).toEqual({
			ok: true,
			body: { name: "test" },
		});
	});

	it("returns reason=missing_body for missing body", () => {
		const event = makeEvent({});
		expect(parseJsonBody(event)).toEqual({
			ok: false,
			reason: "missing_body",
		});
	});

	it("returns reason=invalid_json for invalid JSON", () => {
		const event = makeEvent({ body: "not json" });
		expect(parseJsonBody(event)).toEqual({
			ok: false,
			reason: "invalid_json",
		});
	});

	it("decodes base64-encoded body", () => {
		const event = makeEvent({
			body: Buffer.from(JSON.stringify({ name: "test" })).toString("base64"),
		});
		event.isBase64Encoded = true;
		expect(parseJsonBody(event)).toEqual({
			ok: true,
			body: { name: "test" },
		});
	});
});

describe("requireJsonBody", () => {
	it("returns 400 when body is missing", () => {
		const result = requireJsonBody(makeEvent({}));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.response.statusCode).toBe(400);
			expect(JSON.parse(String(result.response.body))).toEqual({
				message: "Request body is required",
			});
		}
	});

	it("returns 400 when body is invalid JSON", () => {
		const result = requireJsonBody(makeEvent({ body: "not json" }));
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(JSON.parse(String(result.response.body))).toEqual({
				message: "Request body must be valid JSON",
			});
		}
	});
});

describe("withServerError", () => {
	it("returns handler result on success", async () => {
		const result = await withServerError("test", async () => ok({ ok: true }));
		expect(result.statusCode).toBe(200);
	});

	it("returns 500 on thrown error", async () => {
		const result = await withServerError("test", async () => {
			throw new Error("boom");
		});
		expect(result.statusCode).toBe(500);
	});
});

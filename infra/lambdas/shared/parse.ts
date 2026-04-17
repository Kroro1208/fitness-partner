import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { z } from "zod";
import { badRequest } from "./response";

type ParseOk<T> = { ok: true; data: T };
type ParseErr = { ok: false; response: APIGatewayProxyStructuredResultV2 };

/**
 * Untrusted input を Zod schema で parse し、失敗時は 400 レスポンスに変換する。
 * handler 側の parse 境界を一箇所にまとめ、Application 層が入力妥当性の
 * 不安を持たないようにするためのヘルパー。
 */
export function parseRequest<T>(
	schema: z.ZodType<T>,
	input: unknown,
): ParseOk<T> | ParseErr {
	const result = schema.safeParse(input);
	if (!result.success) {
		const first = result.error.issues[0];
		const path = first?.path?.join(".") ?? "";
		const message = path
			? `${path}: ${first?.message ?? "Invalid input"}`
			: (first?.message ?? "Invalid request");
		return { ok: false, response: badRequest(message) };
	}
	return { ok: true, data: result.data };
}

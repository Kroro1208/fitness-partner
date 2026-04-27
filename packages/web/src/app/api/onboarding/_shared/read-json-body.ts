import {
	PayloadTooLargeError,
	ValidationError,
} from "@/shared/errors/app-error";

export type ReadJsonBodyResult =
	| { ok: true; body: unknown }
	| { ok: false; reason: "invalid_json" | "payload_too_large" };

export async function readJsonBody(
	request: Request,
	options: { maxBytes?: number } = {},
): Promise<ReadJsonBodyResult> {
	try {
		const text = await request.text();
		if (
			options.maxBytes !== undefined &&
			new TextEncoder().encode(text).byteLength > options.maxBytes
		) {
			return { ok: false, reason: "payload_too_large" };
		}
		return { ok: true, body: JSON.parse(text) };
	} catch {
		return { ok: false, reason: "invalid_json" };
	}
}

/**
 * `readJsonBody` の throw 版。Route Handler 側で `if (!result.ok) return ...`
 * を毎回書かなくて済むよう、AppError throw に統一する。
 *
 * Result 版 (`readJsonBody`) を残してある理由:
 *   - `readJsonBody` 自体は副作用なしの境界 adapter で、テストで Result を
 *     直接 assert したいケースがある。throw 版はその上に乗せる薄い syntactic helper。
 */
export async function readJsonBodyOrThrow(
	request: Request,
	options: { maxBytes?: number } = {},
): Promise<unknown> {
	const result = await readJsonBody(request, options);
	if (result.ok) return result.body;
	if (result.reason === "payload_too_large") throw new PayloadTooLargeError();
	throw new ValidationError("invalid_json");
}

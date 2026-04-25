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

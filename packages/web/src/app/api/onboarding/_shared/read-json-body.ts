export type ReadJsonBodyResult = { ok: true; body: unknown } | { ok: false };

export async function readJsonBody(
	request: Request,
): Promise<ReadJsonBodyResult> {
	try {
		return { ok: true, body: await request.json() };
	} catch {
		return { ok: false };
	}
}

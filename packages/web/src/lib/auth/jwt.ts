import { z } from "zod";

export type SessionFromIdToken = {
	userId: string;
	email: string;
};

const idTokenPayloadSchema = z.object({
	sub: z.string().min(1),
	email: z.string().email(),
	exp: z.number().optional(),
});

function safeJsonParse(
	input: string,
): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(input) };
	} catch {
		return { ok: false };
	}
}

export function decodeSessionFromIdToken(
	idToken: string,
	now: Date = new Date(),
): SessionFromIdToken | null {
	if (!idToken) return null;
	const parts = idToken.split(".");
	if (parts.length !== 3) return null;

	const json = Buffer.from(parts[1], "base64url").toString("utf-8");
	const decoded = safeJsonParse(json);
	if (!decoded.ok) return null;

	const parsed = idTokenPayloadSchema.safeParse(decoded.value);
	if (!parsed.success) return null;

	const payload = parsed.data;
	if (payload.exp !== undefined && payload.exp * 1000 <= now.getTime()) {
		return null;
	}
	return { userId: payload.sub, email: payload.email };
}

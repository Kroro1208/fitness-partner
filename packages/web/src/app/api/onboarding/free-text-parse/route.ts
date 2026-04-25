import { anthropic } from "@ai-sdk/anthropic";
import { FreeTextParseRequestSchema } from "@fitness/contracts-ts";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { readJsonBody } from "@/app/api/onboarding/_shared/read-json-body";
import { getSession } from "@/lib/auth/session";
import {
	consumeRateLimit,
	rateLimitedResponse,
} from "@/lib/security/rate-limit";
import {
	DEFAULT_JSON_BODY_LIMIT_BYTES,
	enforceContentLength,
	enforceSameOrigin,
} from "@/lib/security/request-guard";

// LLM の structured output 形状。契約の FreeTextParseResponse から note_field を除いた部分。
const llmOutputSchema = z.object({
	extracted_note: z.string(),
	suggested_tags: z.array(z.string()),
});

const NOTE_FIELD_MAP = {
	lifestyle: "lifestyle_note",
	preferences: "preferences_note",
	snacks: "snacks_note",
} as const;

const SYSTEM_PROMPT = `
ユーザーの自由記述から、嗜好や生活パターンの要点を抽出します。
- extracted_note: 1-3 文で要約
- suggested_tags: 構造化候補の文字列配列 (食材名、料理名、習慣名など)
- 構造化済みフィールドを上書きする意図は持たない。note と tag のみを返す
- 出力は日本語
	`.trim();

const FREE_TEXT_MAX_CHARS = 2_000;
const SNAPSHOT_MAX_BYTES = 8 * 1024;
const FREE_TEXT_PARSE_RATE_LIMIT = {
	bucket: "ai:free-text-parse:user",
	limit: 20,
	windowMs: 60 * 60_000,
} as const;

function jsonByteLength(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

export async function POST(request: Request) {
	const origin = enforceSameOrigin(request);
	if (!origin.ok) return origin.response;

	const size = enforceContentLength(request, DEFAULT_JSON_BODY_LIMIT_BYTES);
	if (!size.ok) return size.response;

	const session = await getSession();
	if (!session) {
		return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
	}

	const rateLimit = consumeRateLimit({
		...FREE_TEXT_PARSE_RATE_LIMIT,
		key: session.userId,
	});
	if (!rateLimit.allowed) {
		return rateLimitedResponse(rateLimit.retryAfterSeconds);
	}

	const bodyResult = await readJsonBody(request, {
		maxBytes: DEFAULT_JSON_BODY_LIMIT_BYTES,
	});
	if (!bodyResult.ok) {
		return NextResponse.json(
			{
				error:
					bodyResult.reason === "payload_too_large"
						? "payload_too_large"
						: "invalid_json",
			},
			{ status: bodyResult.reason === "payload_too_large" ? 413 : 400 },
		);
	}

	const parsed = FreeTextParseRequestSchema.safeParse(bodyResult.body);
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_body" }, { status: 400 });
	}
	if (
		parsed.data.free_text.length > FREE_TEXT_MAX_CHARS ||
		jsonByteLength(parsed.data.structured_snapshot) > SNAPSHOT_MAX_BYTES
	) {
		return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
	}

	try {
		// AI SDK v6: generateObject は削除され、generateText + Output.object に統一
		const { experimental_output: object } = await generateText({
			model: anthropic("claude-haiku-4-5"),
			experimental_output: Output.object({ schema: llmOutputSchema }),
			system: SYSTEM_PROMPT,
			prompt: `stage: ${parsed.data.stage}\nfree_text: ${parsed.data.free_text}\nstructured_snapshot: ${JSON.stringify(parsed.data.structured_snapshot)}`,
			maxOutputTokens: 400,
		});
		return NextResponse.json({
			note_field: NOTE_FIELD_MAP[parsed.data.stage],
			extracted_note: object.extracted_note,
			suggested_tags: object.suggested_tags,
		});
	} catch (error) {
		console.error("free-text-parse failed", error);
		return NextResponse.json({ error: "parse_failed" }, { status: 500 });
	}
}

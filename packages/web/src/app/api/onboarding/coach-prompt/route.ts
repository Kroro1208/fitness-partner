import { anthropic } from "@ai-sdk/anthropic";
import { CoachPromptRequestSchema } from "@fitness/contracts-ts";
import { generateText } from "ai";
import { NextResponse } from "next/server";

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

const SYSTEM_PROMPT = `
あなたはパーソナルフィットネスコーチです。
トーン:
- 温かい / 前向き / 命令口調ではない
- 罪悪感を煽らない
- 2-4 文、日本語
- ユーザーの入力済み情報 (profile_snapshot) に軽く言及して、これから聞く内容 (target_stage) の意義を自然に伝える
`.trim();

const FALLBACK_PROMPTS = {
	safety:
		"まずは今の体調や注意点を確認させてください。安心して続けられる提案にするための大事な確認です。",
	stats:
		"ここでは身体の基本情報や目標を整理します。今の状態に合った現実的なプランを組み立てる土台になります。",
	lifestyle:
		"普段の生活リズムを教えてください。続けやすい食事と運動の形に合わせるために必要な情報です。",
	preferences:
		"食事の好みや苦手を把握したいです。無理なく続けられる提案にするため、率直に教えてください。",
	snacks:
		"間食の傾向を知ると、つまずきやすい場面に合わせて調整できます。普段のパターンをそのまま教えてください。",
	feasibility:
		"実行しやすさに関わる条件を確認します。生活に無理なく組み込めるプランにするための仕上げです。",
	review:
		"入力内容の最終確認です。ここまでの情報を整えると、あなたに合う提案の精度が上がります。",
	complete:
		"必要な確認は完了しています。ここまでの内容をもとに、次の提案へつなげていきましょう。",
	blocked:
		"安全のため追加確認が必要な状態です。無理に進めず、まずは状況を落ち着いて確認しましょう。",
} satisfies Record<
	(typeof CoachPromptRequestSchema._type)["target_stage"],
	string
>;

const PROFILE_SNAPSHOT_MAX_BYTES = 8 * 1024;
export const COACH_PROMPT_RATE_LIMIT = {
	bucket: "ai:coach-prompt:user",
	limit: 30,
	windowMs: 60 * 60_000,
} as const;

function jsonByteLength(value: unknown): number {
	return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function buildFallbackPrompt(
	targetStage: (typeof CoachPromptRequestSchema._type)["target_stage"],
): string {
	return FALLBACK_PROMPTS[targetStage];
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function getProperty(value: unknown, key: string): unknown {
	return isUnknownRecord(value) ? value[key] : undefined;
}

function getRequestId(responseHeaders: unknown): unknown {
	if (responseHeaders instanceof Headers) {
		return responseHeaders.get("request-id");
	}
	return getProperty(responseHeaders, "request-id");
}

function summarizeAiError(error: unknown): Record<string, unknown> {
	if (!(error instanceof Error)) {
		return { message: String(error) };
	}

	return {
		name: error.name,
		message: error.message,
		statusCode: getProperty(error, "statusCode"),
		requestId: getRequestId(getProperty(error, "responseHeaders")),
		data: getProperty(error, "data"),
		responseBody: getProperty(error, "responseBody"),
	};
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
		...COACH_PROMPT_RATE_LIMIT,
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

	const parsed = CoachPromptRequestSchema.safeParse(bodyResult.body);
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_body" }, { status: 400 });
	}
	if (
		jsonByteLength(parsed.data.profile_snapshot) > PROFILE_SNAPSHOT_MAX_BYTES
	) {
		return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
	}

	try {
		const { text } = await generateText({
			model: anthropic("claude-haiku-4-5"),
			system: SYSTEM_PROMPT,
			prompt: `target_stage: ${parsed.data.target_stage}\nprofile_snapshot: ${JSON.stringify(parsed.data.profile_snapshot)}`,
			maxOutputTokens: 200,
		});
		return NextResponse.json({ prompt: text, cached: false });
	} catch (error) {
		console.error("coach-prompt generation failed", {
			userId: session.userId,
			targetStage: parsed.data.target_stage,
			error: summarizeAiError(error),
		});
		return NextResponse.json(
			{
				prompt: buildFallbackPrompt(parsed.data.target_stage),
				cached: true,
			},
			{ status: 200 },
		);
	}
}

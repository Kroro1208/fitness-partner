import { anthropic } from "@ai-sdk/anthropic";
import { CoachPromptRequestSchema } from "@fitness/contracts-ts";
import { generateText } from "ai";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/app/api/onboarding/_shared/read-json-body";
import { getSession } from "@/lib/auth/session";

const SYSTEM_PROMPT = `
あなたはパーソナルフィットネスコーチです。
トーン:
- 温かい / 前向き / 命令口調ではない
- 罪悪感を煽らない
- 2-4 文、日本語
- ユーザーの入力済み情報 (profile_snapshot) に軽く言及して、これから聞く内容 (target_stage) の意義を自然に伝える
`.trim();

export async function POST(request: Request) {
	const session = await getSession();
	if (!session) {
		return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
	}

	const bodyResult = await readJsonBody(request);
	if (!bodyResult.ok) {
		return NextResponse.json({ error: "invalid_json" }, { status: 400 });
	}

	const parsed = CoachPromptRequestSchema.safeParse(bodyResult.body);
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_body" }, { status: 400 });
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
		console.error("coach-prompt generation failed", error);
		return NextResponse.json({ error: "generation_failed" }, { status: 500 });
	}
}

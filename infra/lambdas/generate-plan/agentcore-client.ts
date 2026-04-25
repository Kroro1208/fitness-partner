/// <reference lib="esnext.array" />
// Array.fromAsync は ESNext.Array に定義されている。infra tsconfig の lib は
// ES2022 だが、Node 22 runtime はネイティブ対応している。このファイル限定で
// triple-slash reference により型だけ有効化する (他ファイルへの影響なし)。
import { randomUUID } from "node:crypto";
import {
	BedrockAgentCoreClient,
	InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import type { SafeAgentInput, SafePromptProfile } from "@fitness/contracts-ts";

/**
 * AgentCore Runtime に渡す payload。
 * safe_prompt_profile / safe_agent_input は contracts-ts の型で厳密化しておき、
 * 呼び出し元 (index.ts) が契約外のフィールドを混入させることを型レベルで禁じる。
 */
export interface InvokePayload {
	user_id: string;
	week_start: string;
	safe_prompt_profile: SafePromptProfile;
	safe_agent_input: SafeAgentInput;
}

/**
 * env 必須チェックはここで一括 fail-loud。ARN と REGION は CDK が同時に注入する
 * 前提 (generate-plan-lambda.ts の environment block)。片方だけ未設定で
 * init が通る silent fallback を防ぐ。
 */
function getConfig(): { region: string; runtimeArn: string } {
	const region = process.env.AGENTCORE_REGION;
	if (!region) throw new Error("AGENTCORE_REGION env var is required");
	const runtimeArn = process.env.AGENTCORE_RUNTIME_ARN;
	if (!runtimeArn) throw new Error("AGENTCORE_RUNTIME_ARN env var is required");
	return { region, runtimeArn };
}

// Lazy init: handler 初回呼び出し時に AWS SDK クライアントを作る。
// 単体テストは `vi.mock("@aws-sdk/client-bedrock-agentcore", ...)` で差し替える。
let _client: BedrockAgentCoreClient | null = null;
function getClient(region: string): BedrockAgentCoreClient {
	if (_client === null) {
		_client = new BedrockAgentCoreClient({ region });
	}
	return _client;
}

/**
 * Bedrock AgentCore Runtime を呼び出し、JSON payload をストリーム経由で受け取って
 * パースする。timeoutMs 経過で AbortController により abort する
 * (handler 側で `AbortError` を捕捉して 504 に変換)。
 */
export async function invokeAgent(
	payload: InvokePayload,
	timeoutMs: number,
): Promise<unknown> {
	const { region, runtimeArn } = getConfig();
	const client = getClient(region);
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), timeoutMs);
	try {
		const response = await client.send(
			new InvokeAgentRuntimeCommand({
				agentRuntimeArn: runtimeArn,
				qualifier: "DEFAULT",
				runtimeSessionId: randomUUID(),
				contentType: "application/json",
				accept: "application/json",
				payload: new TextEncoder().encode(JSON.stringify(payload)),
			}),
			{ abortSignal: abort.signal },
		);
		const text = await streamToString(response.response);
		return JSON.parse(text);
	} finally {
		clearTimeout(timer);
	}
}

function isAsyncIterableUint8Array(v: unknown): v is AsyncIterable<Uint8Array> {
	// `typeof v === "object"` 実行後は v が `object | null` に narrow される。
	// null を除いた後は `in` 演算子の右辺として cast なしで受け渡せる。
	if (v === null || typeof v !== "object") return false;
	return Symbol.asyncIterator in v;
}

async function streamToString(stream: unknown): Promise<string> {
	if (stream === undefined) return "";
	if (!isAsyncIterableUint8Array(stream)) {
		throw new Error("AgentCore response is not an async iterable");
	}
	// ES2024+: Array.fromAsync で async iterable を一括収集。`let` + `push` を避ける。
	const chunks = await Array.fromAsync(stream, (chunk) => Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
}

/// <reference lib="esnext.array" />
// generate-plan/agentcore-client.ts と同じ pattern。Strands container に
// { action: "swap_candidates", swap_context } を渡し、JSON レスポンスを返す。
import { randomUUID } from "node:crypto";
import {
	BedrockAgentCoreClient,
	InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";
import type { MealSwapContext } from "@fitness/contracts-ts";

export interface InvokeSwapPayload {
	swap_context: MealSwapContext;
}

function getConfig(): { region: string; runtimeArn: string } {
	const region = process.env.AGENTCORE_REGION;
	if (!region) throw new Error("AGENTCORE_REGION env var is required");
	const runtimeArn = process.env.AGENTCORE_RUNTIME_ARN;
	if (!runtimeArn) throw new Error("AGENTCORE_RUNTIME_ARN env var is required");
	return { region, runtimeArn };
}

let _client: BedrockAgentCoreClient | null = null;
function getClient(region: string): BedrockAgentCoreClient {
	if (_client === null) {
		_client = new BedrockAgentCoreClient({ region });
	}
	return _client;
}

/**
 * Bedrock AgentCore Runtime を呼び出して swap 候補を生成する。
 * payload の action 固定: "swap_candidates"。Strands handler が
 * action で dispatch する。
 */
export async function invokeSwapAgent(
	input: InvokeSwapPayload,
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
				payload: new TextEncoder().encode(
					JSON.stringify({
						action: "swap_candidates",
						swap_context: input.swap_context,
					}),
				),
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
	if (v === null || typeof v !== "object") return false;
	return Symbol.asyncIterator in v;
}

async function streamToString(stream: unknown): Promise<string> {
	if (stream === undefined) return "";
	if (!isAsyncIterableUint8Array(stream)) {
		throw new Error("AgentCore response is not an async iterable");
	}
	const chunks = await Array.fromAsync(stream, (chunk) => Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
}

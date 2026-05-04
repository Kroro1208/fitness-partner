// 間接プロンプトインジェクション対策ユーティリティ (lambda 側)。
//
// 対応する skill: `.claude/skills/prompt-injection-defense/SKILL.md`
// `packages/web/src/lib/security/prompt-injection.ts` と同等のパターンを保持する。
// パターン定義を変えるときは両方を同時に更新する (drift を避ける)。
//
// 用途: SafePromptProfile / SafeAgentInput / MealSwapContext を Bedrock AgentCore
// に渡す前にユーザー由来文字列フィールドを sanitize する。

const REDACTED_PLACEHOLDER = "[REDACTED:prompt-injection-detected]";

const INJECTION_PATTERNS: readonly RegExp[] = [
	/ignore\s+(?:all\s+)?previous\s+instructions/i,
	/disregard\s+(?:all\s+)?previous\s+instructions/i,
	/forget\s+(?:all\s+)?previous\s+(?:instructions|commands|context)/i,
	/ignore\s+all\s+prior\s+(?:rules|prompts|instructions)/i,
	/reset\s*:\s*ignore\s+all\s+previous/i,
	/system\s+override/i,
	/new\s+primary\s+directive/i,
	/if\s+you\s+are\s+an?\s+(?:llm|ai|language\s+model)/i,
	/you\s+are\s+now\s+in\s+debug\s+mode/i,
	/begin[_\s-]?admin[_\s-]?session/i,
];

const OUTPUT_RED_FLAGS: readonly RegExp[] = [
	/<<<\s*begin\s+system\s+prompt\s*>>>/i,
	/(?:ignoring|ignored|disregarding|disregarded)\s+previous\s+instructions/i,
	/sudo\s+rm\s+-rf/i,
	/drop\s+table\s+\w+/i,
	/i\s+am\s+a\s+bot/i,
];

export type InjectionEvent = {
	readonly fieldPath: string;
	readonly patterns: readonly string[];
};

export type SanitizedRecord<T> = {
	readonly clean: T;
	readonly redacted: boolean;
	readonly events: readonly InjectionEvent[];
};

export function detectInjectionPatterns(text: string): string[] {
	if (typeof text !== "string" || text.length === 0) return [];
	return INJECTION_PATTERNS.filter((re) => re.test(text)).map(
		(re) => re.source,
	);
}

export function sanitizeUntrustedString(text: unknown): {
	clean: string;
	redacted: boolean;
	patterns: readonly string[];
} {
	if (typeof text !== "string") {
		return { clean: "", redacted: false, patterns: [] };
	}
	const patterns = detectInjectionPatterns(text);
	if (patterns.length === 0) {
		return { clean: text, redacted: false, patterns: [] };
	}
	return { clean: REDACTED_PLACEHOLDER, redacted: true, patterns };
}

export type OutputValidation = { ok: true } | { ok: false; reason: string };

export function validateLLMOutput(output: string): OutputValidation {
	if (typeof output !== "string" || output.length === 0) return { ok: true };

	if (/<<<\s*begin\s+system\s+prompt\s*>>>/i.test(output)) {
		return { ok: false, reason: "system_prompt_leak" };
	}
	for (const re of OUTPUT_RED_FLAGS) {
		if (re.test(output)) {
			return { ok: false, reason: `injection_signal:${re.source}` };
		}
	}
	return { ok: true };
}

export function validateLLMOutputRecord(value: unknown): OutputValidation {
	return validateOutputValue(value, "");
}

type RecordOptions = {
	readonly source?: string;
};

/**
 * オブジェクトの string / string[] / ネスト object を再帰的に sanitize する。
 * 検出時は audit log を出すが、raw 文字列はログに乗せない (CloudWatch 漏洩防止)。
 */
export function sanitizeUntrustedRecord<T extends Record<string, unknown>>(
	input: T,
	options: RecordOptions = {},
): SanitizedRecord<T> {
	const { value, events } = walk(input, "");
	const redacted = events.length > 0;
	if (redacted) {
		logInjectionEvent({
			source: options.source,
			fieldPaths: events.map((e) => e.fieldPath),
		});
	}
	return { clean: value as T, redacted, events };
}

type WalkResult = {
	readonly value: unknown;
	readonly events: readonly InjectionEvent[];
};

// pure 再帰関数: 引数を mutate せず、変換後の値と検出イベントの両方を返す。
function walk(value: unknown, path: string): WalkResult {
	if (typeof value === "string") {
		const result = sanitizeUntrustedString(value);
		return {
			value: result.clean,
			events: result.redacted
				? [{ fieldPath: path, patterns: result.patterns }]
				: [],
		};
	}
	if (Array.isArray(value)) {
		const items = value.map((item, i) => walk(item, `${path}[${i}]`));
		return {
			value: items.map((r) => r.value),
			events: items.flatMap((r) => r.events),
		};
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).map(
			([k, v]) => [k, walk(v, path === "" ? k : `${path}.${k}`)] as const,
		);
		return {
			value: Object.fromEntries(entries.map(([k, r]) => [k, r.value])),
			events: entries.flatMap(([, r]) => r.events),
		};
	}
	return { value, events: [] };
}

function validateOutputValue(value: unknown, path: string): OutputValidation {
	if (typeof value === "string") {
		const result = validateLLMOutput(value);
		return result.ok
			? result
			: { ok: false, reason: `${path || "$"}:${result.reason}` };
	}
	if (Array.isArray(value)) {
		for (const [i, item] of value.entries()) {
			const result = validateOutputValue(item, `${path}[${i}]`);
			if (!result.ok) return result;
		}
		return { ok: true };
	}
	if (value !== null && typeof value === "object") {
		for (const [key, item] of Object.entries(
			value as Record<string, unknown>,
		)) {
			const result = validateOutputValue(
				item,
				path === "" ? key : `${path}.${key}`,
			);
			if (!result.ok) return result;
		}
	}
	return { ok: true };
}

type LogPayload = {
	readonly source?: string;
	readonly fieldPaths?: readonly string[];
	readonly reason?: string;
};

export function logInjectionEvent(payload: LogPayload): void {
	console.warn("prompt_injection_detected", {
		ts: new Date().toISOString(),
		...payload,
	});
}

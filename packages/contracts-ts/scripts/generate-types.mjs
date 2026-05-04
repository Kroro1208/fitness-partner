// @ts-check
/**
 * JSON Schema ファイルから TypeScript 型宣言を生成する。
 * 複数スキーマ間で $defs を共有するモデル (FoodItem → NutrientValue 等) の
 * 重複型定義を除去する。
 *
 * 入力:  packages/contracts-ts/schemas/*.schema.json
 * 出力:  packages/contracts-ts/generated/types.d.ts
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
/** @import { JSONSchema } from "json-schema-to-typescript" */
import { compile } from "json-schema-to-typescript";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const schemasDir = join(pkgRoot, "schemas");
const outFile = join(pkgRoot, "generated", "types.d.ts");

/**
 * 1 行分の `{` / `}` の差を初期値に加算した深さを返す。
 * @param {string} line
 * @param {number} initial
 * @returns {number}
 */
function countBraces(line, initial) {
	return [...line].reduce((depth, ch) => {
		if (ch === "{") return depth + 1;
		if (ch === "}") return depth - 1;
		return depth;
	}, initial);
}

/**
 * @typedef {{
 *   readonly seen: ReadonlySet<string>,
 *   readonly result: readonly string[],
 *   readonly skipBlock: "interface" | "type" | null,
 *   readonly braceDepth: number,
 *   readonly pendingComment: readonly string[],
 *   readonly inComment: boolean,
 * }} DedupState
 */

/** @type {DedupState} */
const INITIAL_STATE = {
	seen: new Set(),
	result: [],
	skipBlock: null,
	braceDepth: 0,
	pendingComment: [],
	inComment: false,
};

/**
 * 1 行を読んで次の状態を返す pure transition。
 * @param {DedupState} s
 * @param {string} line
 * @returns {DedupState}
 */
function stepDedup(s, line) {
	// interface skip: 中括弧バランスで終端判定
	if (s.skipBlock === "interface") {
		const depth = countBraces(line, s.braceDepth);
		return {
			...s,
			braceDepth: depth,
			skipBlock: depth <= 0 ? null : "interface",
		};
	}
	// type skip: ネスト外の `;` 終端のみ。内部行の `;` で誤解除しないよう
	// braceDepth を追跡する (BUG-62996d1f 再発防止)。
	if (s.skipBlock === "type") {
		const depth = countBraces(line, s.braceDepth);
		const ended = depth <= 0 && line.trimEnd().endsWith(";");
		return {
			...s,
			braceDepth: depth,
			skipBlock: ended ? null : "type",
		};
	}
	// JSDoc コメントの開始: 直前コメントは捨てて新規ブロック
	if (line.trimStart().startsWith("/**")) {
		return { ...s, inComment: true, pendingComment: [line] };
	}
	// JSDoc コメント本文
	if (s.inComment) {
		const closes = line.trimStart().startsWith("*/") || line.includes("*/");
		return {
			...s,
			pendingComment: [...s.pendingComment, line],
			inComment: !closes,
		};
	}
	// export interface X { ... }
	const ifaceMatch = line.match(/^export\s+interface\s+(\w+)\s*\{/);
	if (ifaceMatch) {
		const name = ifaceMatch[1];
		if (s.seen.has(name)) {
			return {
				...s,
				pendingComment: [],
				skipBlock: "interface",
				braceDepth: 1,
			};
		}
		return {
			...s,
			seen: new Set([...s.seen, name]),
			result: [...s.result, ...s.pendingComment, line],
			pendingComment: [],
		};
	}
	// export type X = ...
	const typeMatch = line.match(/^export\s+type\s+(\w+)\s*=/);
	if (typeMatch) {
		const name = typeMatch[1];
		if (s.seen.has(name)) {
			if (line.trimEnd().endsWith(";")) {
				return { ...s, pendingComment: [] };
			}
			return {
				...s,
				pendingComment: [],
				skipBlock: "type",
				braceDepth: countBraces(line, 0),
			};
		}
		return {
			...s,
			seen: new Set([...s.seen, name]),
			result: [...s.result, ...s.pendingComment, line],
			pendingComment: [],
		};
	}
	// 通常行 (空行など): 保留中コメントと共に出力
	return {
		...s,
		result: [...s.result, ...s.pendingComment, line],
		pendingComment: [],
	};
}

/**
 * コンパイル済み TS コードから重複する export type / export interface を除去する。
 * 最初に出現した定義のみを残す。pure 関数。
 * @param {string} code
 * @returns {string}
 */
export function deduplicateTypes(code) {
	const final = code.split("\n").reduce(stepDedup, INITIAL_STATE);
	return [...final.result, ...final.pendingComment].join("\n");
}

/**
 * @param {unknown} node
 * @param {boolean} [isRoot]
 * @param {boolean} [keysArePropertyNames]
 * @returns {unknown}
 */
function normalizeSchemaForTypes(node, isRoot = true, keysArePropertyNames = false) {
	if (node === null || typeof node !== "object") {
		return node;
	}

	if (Array.isArray(node)) {
		return node.map((item) => normalizeSchemaForTypes(item, false, false));
	}

	/** @type {Record<string, unknown>} */
	const normalized = {};
	for (const [key, value] of Object.entries(
		/** @type {Record<string, unknown>} */ (node),
	)) {
		// JSON Schema metadata の "title" はトップレベル以外で除去する。
		// ただし `properties` / `$defs` 直下のキーは型名・プロパティ名なので保持する。
		if (key === "title" && !isRoot && !keysArePropertyNames) continue;
		if (key === "format" && value === "date") continue;
		if (key === "x-at-least-one-not-null") continue;
		// `properties` / `$defs` の value は { propName: schema } なので、
		// そのエントリのキーはプロパティ名 / 型名として扱う必要がある。
		const childKeysArePropertyNames =
			!keysArePropertyNames && (key === "properties" || key === "$defs");
		normalized[key] = normalizeSchemaForTypes(
			value,
			false,
			childKeysArePropertyNames,
		);
	}
	// json-schema-to-typescript は min/maxItems を tuple / tuple union に変換する。
	// この repo の契約は runtime 制約として長さを保持したいだけで、consumer 側では
	// ergonomic な可変長配列型が必要なので、型生成時だけ配列長メタを落とす。
	if ("items" in normalized) {
		delete normalized.minItems;
		delete normalized.maxItems;
	}
	return normalized;
}

async function main() {
	const schemaFiles = readdirSync(schemasDir)
		.filter((f) => f.endsWith(".schema.json"))
		.sort();

	if (schemaFiles.length === 0) {
		throw new Error(`no *.schema.json files found in ${schemasDir}`);
	}

	const parts = [
		"/**",
		" * AUTO-GENERATED by scripts/generate-types.mjs — DO NOT EDIT.",
		" * Source: packages/contracts-ts/schemas/*.schema.json",
		" */",
		"",
	];

	for (const file of schemaFiles) {
		const schemaPath = join(schemasDir, file);
		const schemaText = readFileSync(schemaPath, "utf8");
		const schema = /** @type {JSONSchema} */ (
			normalizeSchemaForTypes(JSON.parse(schemaText))
		);
		const modelName = file.replace(/\.schema\.json$/, "");

		const ts = await compile(schema, modelName, {
			bannerComment: "",
			additionalProperties: false,
			style: { singleQuote: false },
		});

		parts.push(ts);
	}

	const raw = parts.join("\n");
	const deduplicated = deduplicateTypes(raw);

	mkdirSync(dirname(outFile), { recursive: true });
	writeFileSync(outFile, deduplicated);
	console.log(`wrote ${resolve(outFile)}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

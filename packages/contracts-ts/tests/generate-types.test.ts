import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deduplicateTypes } from "../scripts/generate-types.mjs";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedTypes = join(pkgRoot, "generated", "types.d.ts");

/**
 * `generate-types.mjs` の役割は「JSON Schema から TypeScript 型宣言を生成
 * してファイルに書き出す」という副作用。本テストはその副作用だけを検証する:
 *
 *  1. ファイルが生成されていること
 *  2. 中身が空でないこと
 *  3. CalorieMacroResult という識別子を含むこと
 *
 * 生成されたコードの**具体的な形式** (interface vs type alias / フィールド型が
 * 直接 `number` か `Bmr` エイリアス経由か等) は `json-schema-to-typescript` の
 * 実装詳細なので検証しない。型としての正しさ・制約の保持は以下で担保される:
 *
 *   - `roundtrip.test.ts`: 生成された Zod スキーマとの互換性 (振る舞い)
 *   - `tsc --noEmit`: パッケージ全体の型チェック (CI の typescript ジョブが実行)
 */
describe("generate-types 出力", () => {
	it("generated/types.d.ts を出力すること", () => {
		expect(existsSync(generatedTypes)).toBe(true);
	});

	it("空でない CalorieMacroResult の型宣言を含むこと", () => {
		const contents = readFileSync(generatedTypes, "utf8");
		expect(contents.length).toBeGreaterThan(0);
		// 識別子 CalorieMacroResult が存在する (宣言形式は問わない)
		expect(contents).toMatch(/\bCalorieMacroResult\b/);
	});
});

describe("deduplicateTypes", () => {
	it("単行 type alias の重複を除去する", () => {
		const input = [
			'export type Status = "a" | "b";',
			'export type Status = "a" | "b";',
		].join("\n");
		const out = deduplicateTypes(input);
		const matches = out.match(/^export type Status\b/gm) ?? [];
		expect(matches).toHaveLength(1);
	});

	it("multiline type alias (object + union) の重複を完全にスキップする", () => {
		// json-schema-to-typescript が oneOf: [{type:object,...}, null] で
		// 出力するパターン。重複側の内部行 `a?: string;` で skipBlock が
		// 早期解除されると `b?: number;` 以降が emit に流れ、TypeScript
		// コンパイルが破壊される (BUG-62996d1f)。
		const input = [
			"export type FooObj = {",
			"  a?: string;",
			"  b?: number;",
			"} | null;",
			"export type FooObj = {",
			"  a?: string;",
			"  b?: number;",
			"} | null;",
			"export type Trailing = string;",
		].join("\n");
		const out = deduplicateTypes(input);
		const fooMatches = out.match(/^export type FooObj\b/gm) ?? [];
		expect(fooMatches).toHaveLength(1);
		// 重複側の内部行が leak していないこと
		const aMatches = out.match(/^ {2}a\?: string;$/gm) ?? [];
		expect(aMatches).toHaveLength(1);
		const bMatches = out.match(/^ {2}b\?: number;$/gm) ?? [];
		expect(bMatches).toHaveLength(1);
		const closingMatches = out.match(/^} \| null;$/gm) ?? [];
		expect(closingMatches).toHaveLength(1);
		// 後続の type 宣言が正しく拾われていること (skipBlock が type ブロック
		// 末尾で解除されて Trailing が emit される)
		expect(out).toMatch(/^export type Trailing = string;$/m);
	});

	it("multiline union type (braces なし) の重複を除去する", () => {
		const input = [
			"export type Choice =",
			'  | "a"',
			'  | "b";',
			"export type Choice =",
			'  | "a"',
			'  | "b";',
		].join("\n");
		const out = deduplicateTypes(input);
		const matches = out.match(/^export type Choice\b/gm) ?? [];
		expect(matches).toHaveLength(1);
	});

	it("multiline interface の重複を除去する", () => {
		const input = [
			"export interface Bar {",
			"  x: number;",
			"}",
			"export interface Bar {",
			"  x: number;",
			"}",
		].join("\n");
		const out = deduplicateTypes(input);
		const matches = out.match(/^export interface Bar\b/gm) ?? [];
		expect(matches).toHaveLength(1);
	});
});

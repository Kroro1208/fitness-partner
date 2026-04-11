import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

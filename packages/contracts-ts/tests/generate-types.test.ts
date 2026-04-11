import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedTypes = join(pkgRoot, "generated", "types.d.ts");

describe("generate-types 出力", () => {
  it("generated/types.d.ts を出力すること", () => {
    expect(existsSync(generatedTypes)).toBe(true);
  });

  it("CalorieMacroResult インターフェースを宣言すること", () => {
    const contents = readFileSync(generatedTypes, "utf8");
    expect(contents).toMatch(/interface CalorieMacroResult/);
    expect(contents).toMatch(/bmr\s*:\s*Bmr/);
    expect(contents).toMatch(/activity_multiplier\s*:\s*ActivityMultiplier/);
    expect(contents).toMatch(/explanation\s*\?\s*:\s*Explanation/);
  });
});

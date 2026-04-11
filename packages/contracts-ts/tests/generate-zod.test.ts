import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const generatedZod = join(pkgRoot, "generated", "zod.ts");

describe("generate-zod 出力", () => {
  it("generated/zod.ts を出力すること", () => {
    expect(existsSync(generatedZod)).toBe(true);
  });

  it("CalorieMacroResultSchema を runtime で import して使えること", async () => {
    const mod = await import("../generated/zod.ts");
    expect(mod.CalorieMacroResultSchema).toBeDefined();
    // 振る舞い検証: Zod スキーマとしての API (parse) が動作する
    expect(typeof mod.CalorieMacroResultSchema.parse).toBe("function");
  });
});

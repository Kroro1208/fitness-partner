import { describe, expect, it } from "vitest";
import { CalorieMacroResultSchema } from "../generated/zod.ts";
import type { CalorieMacroResult } from "../generated/types";

describe("Pydantic → JSON Schema → TS + Zod の round trip", () => {
  it("Python モデルから生成された妥当なペイロードを受け入れる", () => {
    const payload = {
      bmr: 1500,
      activity_multiplier: 1.55,
      tdee: 2325,
      target_calories: 1825,
      protein_g: 140,
      fat_g: 60,
      carbs_g: 180,
      explanation: ["BMR via Mifflin-St Jeor", "TDEE = BMR * 1.55"],
    };

    const parsed = CalorieMacroResultSchema.parse(payload);

    // 型アサーション: parse 結果が生成された TS 型に代入可能であること。
    const typed: CalorieMacroResult = parsed as CalorieMacroResult;
    expect(typed.bmr).toBe(1500);
    expect(typed.explanation).toHaveLength(2);
  });

  it("必須フィールドが欠けているペイロードを拒否する", () => {
    const bad = {
      bmr: 1500,
      activity_multiplier: 1.55,
      // tdee が欠けている
      target_calories: 1825,
      protein_g: 140,
      fat_g: 60,
      carbs_g: 180,
    };
    expect(() => CalorieMacroResultSchema.parse(bad)).toThrow();
  });

  it("activity_multiplier が範囲外のペイロードを拒否する", () => {
    const bad = {
      bmr: 1500,
      activity_multiplier: 3.0,
      tdee: 2325,
      target_calories: 1825,
      protein_g: 140,
      fat_g: 60,
      carbs_g: 180,
    };
    expect(() => CalorieMacroResultSchema.parse(bad)).toThrow();
  });

  it("bmr が負のペイロードを拒否する", () => {
    const bad = {
      bmr: -100,
      activity_multiplier: 1.2,
      tdee: 2000,
      target_calories: 1500,
      protein_g: 100,
      fat_g: 50,
      carbs_g: 200,
    };
    expect(() => CalorieMacroResultSchema.parse(bad)).toThrow();
  });
});

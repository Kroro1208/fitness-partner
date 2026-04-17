import { describe, expect, it } from "vitest";

import { buildUpdateInput } from "../build-update-input";

describe("buildUpdateInput", () => {
	it("文字列フィールドの変更値をそのまま格納する", () => {
		const result = buildUpdateInput(
			["sex"],
			{ sex: "male" },
			{ sex: "female" },
		);
		expect(result).toEqual({ ok: true, value: { sex: "male" } });
	});

	it("数値フィールドは Number に変換して格納する", () => {
		const result = buildUpdateInput(
			["age", "weight_kg"],
			{ age: "30", weight_kg: "65.5" },
			{ age: 29, weight_kg: 70 },
		);
		expect(result).toEqual({
			ok: true,
			value: { age: 30, weight_kg: 65.5 },
		});
	});

	it("複数フィールド同時変更でも全て反映される", () => {
		const result = buildUpdateInput(
			["age", "sex", "height_cm"],
			{ age: "25", sex: "male", height_cm: "170" },
			{ age: 20, sex: "female", height_cm: 160 },
		);
		expect(result).toEqual({
			ok: true,
			value: { age: 25, sex: "male", height_cm: 170 },
		});
	});

	it("入力が空文字で元値が非 null の場合は null を送る", () => {
		const result = buildUpdateInput(
			["weight_kg"],
			{ weight_kg: "" },
			{ weight_kg: 70 },
		);
		expect(result).toEqual({ ok: true, value: { weight_kg: null } });
	});

	it("入力が空文字で元値も null の場合はフィールドを送らない", () => {
		const result = buildUpdateInput(
			["weight_kg"],
			{ weight_kg: "" },
			{ weight_kg: null },
		);
		expect(result).toEqual({ ok: true, value: {} });
	});

	it("数値フィールドに数値変換できない文字列が入ったらエラーを返す", () => {
		const result = buildUpdateInput(["age"], { age: "abc" }, { age: 30 });
		expect(result).toEqual({
			ok: false,
			error: { field: "age", message: "age は数値で入力してください" },
		});
	});

	it("前後の空白はトリムした上で空判定する", () => {
		const result = buildUpdateInput(
			["weight_kg"],
			{ weight_kg: "   " },
			{ weight_kg: 70 },
		);
		expect(result).toEqual({ ok: true, value: { weight_kg: null } });
	});
});

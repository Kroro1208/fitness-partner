import { describe, expect, it } from "vitest";

import { weekStartOf } from "./week-start";

describe("weekStartOf", () => {
	it("月曜はそのまま", () => {
		expect(weekStartOf(new Date("2026-04-20T10:00:00+09:00"))).toBe(
			"2026-04-20",
		);
	});
	it("水曜は前の月曜", () => {
		expect(weekStartOf(new Date("2026-04-22T10:00:00+09:00"))).toBe(
			"2026-04-20",
		);
	});
	it("日曜は前の月曜", () => {
		expect(weekStartOf(new Date("2026-04-26T10:00:00+09:00"))).toBe(
			"2026-04-20",
		);
	});
	it("UTC で日曜の深夜でも JST では月曜扱い", () => {
		// 2026-04-19T15:30:00Z は JST で 2026-04-20T00:30 (月曜)
		expect(weekStartOf(new Date("2026-04-19T15:30:00Z"))).toBe("2026-04-20");
	});
	it("JST で日曜 23:59 は前の月曜", () => {
		// 2026-04-26T14:59:00Z は JST で 2026-04-26T23:59 (日曜)
		expect(weekStartOf(new Date("2026-04-26T14:59:00Z"))).toBe("2026-04-20");
	});
	it("月初をまたぐ週境界", () => {
		// JST で 2026-05-02 (土) → 前の月曜は 2026-04-27
		expect(weekStartOf(new Date("2026-05-02T10:00:00+09:00"))).toBe(
			"2026-04-27",
		);
	});
});

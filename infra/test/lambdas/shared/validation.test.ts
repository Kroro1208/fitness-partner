import { describe, expect, it } from "vitest";
import {
	isInRange,
	isRecord,
	isValidDate,
	isValidEnum,
	isValidFoodId,
} from "../../../lambdas/shared/validation";

describe("isValidDate", () => {
	it("accepts valid date", () => {
		expect(isValidDate("2026-04-13")).toBe(true);
	});

	it("rejects invalid format (no hyphens)", () => {
		expect(isValidDate("20260413")).toBe(false);
	});

	it("rejects impossible date (month 99)", () => {
		expect(isValidDate("2026-99-01")).toBe(false);
	});

	it("rejects impossible date (day 32)", () => {
		expect(isValidDate("2026-01-32")).toBe(false);
	});

	it("rejects non-string", () => {
		expect(isValidDate(123)).toBe(false);
	});

	it("rejects undefined", () => {
		expect(isValidDate(undefined)).toBe(false);
	});
});

describe("isValidFoodId", () => {
	it("accepts non-empty string", () => {
		expect(isValidFoodId("01001")).toBe(true);
	});

	it("rejects empty string", () => {
		expect(isValidFoodId("")).toBe(false);
	});

	it("rejects non-string", () => {
		expect(isValidFoodId(1001)).toBe(false);
	});
});

describe("isValidEnum", () => {
	const allowed = {
		a: true,
		b: true,
		c: true,
	} as const;

	it("accepts valid value", () => {
		expect(isValidEnum("a", allowed)).toBe(true);
	});

	it("rejects invalid value", () => {
		expect(isValidEnum("d", allowed)).toBe(false);
	});

	it("rejects non-string", () => {
		expect(isValidEnum(123, allowed)).toBe(false);
	});
});

describe("isInRange", () => {
	it("accepts value within gt/lt range", () => {
		expect(isInRange(50, { gt: 0, lt: 100 })).toBe(true);
	});

	it("rejects value at gt boundary (exclusive)", () => {
		expect(isInRange(0, { gt: 0 })).toBe(false);
	});

	it("rejects value at lt boundary (exclusive)", () => {
		expect(isInRange(100, { lt: 100 })).toBe(false);
	});

	it("accepts value at ge boundary (inclusive)", () => {
		expect(isInRange(0, { ge: 0 })).toBe(true);
	});

	it("accepts value at le boundary (inclusive)", () => {
		expect(isInRange(24, { le: 24 })).toBe(true);
	});

	it("rejects NaN", () => {
		expect(isInRange(NaN, { gt: 0 })).toBe(false);
	});

	it("rejects non-number", () => {
		expect(isInRange("50", { gt: 0 })).toBe(false);
	});
});

describe("isRecord", () => {
	it("accepts plain object", () => {
		expect(isRecord({ a: 1 })).toBe(true);
	});

	it("rejects null", () => {
		expect(isRecord(null)).toBe(false);
	});

	it("rejects array", () => {
		expect(isRecord([1, 2])).toBe(false);
	});

	it("rejects string", () => {
		expect(isRecord("test")).toBe(false);
	});
});

import type { FoodId, IsoDateString } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * YYYY-MM-DD 形式かつ実在する日付であることを検証する。
 * regex だけだと 2026-99-99 を通すため、Date パースで実日付を確認。
 */
export function isValidDate(value: unknown): value is IsoDateString {
	if (typeof value !== "string" || !DATE_RE.test(value)) return false;
	const d = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function isValidFoodId(value: unknown): value is FoodId {
	return typeof value === "string" && value.length > 0;
}

/**
 * unknown を Record<string, unknown> に narrowing する型ガード。
 * `as Record<string, unknown>` を排除するために使う。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 値が指定 Set に含まれるか検証する。
 */
export function isValidEnum<T extends string>(
	value: unknown,
	allowed: Readonly<Record<T, true>>,
): value is T {
	return typeof value === "string" && Object.hasOwn(allowed, value);
}

/**
 * 数値が (gt, lt) 範囲内か検証する。境界は含まない。
 */
export function isInRange(
	value: unknown,
	opts: { gt?: number; lt?: number; ge?: number; le?: number },
): value is number {
	if (typeof value !== "number" || Number.isNaN(value)) return false;
	if (opts.gt !== undefined && value <= opts.gt) return false;
	if (opts.lt !== undefined && value >= opts.lt) return false;
	if (opts.ge !== undefined && value < opts.ge) return false;
	if (opts.le !== undefined && value > opts.le) return false;
	return true;
}

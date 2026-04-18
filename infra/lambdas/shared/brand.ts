export type Brand<T, B extends string> = T & { readonly __brand: B };

export type UserId = Brand<string, "UserId">;
export type MealId = Brand<string, "MealId">;
export type FoodId = Brand<string, "FoodId">;
export type IsoDateString = Brand<string, "IsoDateString">;

/**
 * Brand 昇格の正規入口。空文字列など明らかに不正な値を握りつぶさないよう
 * parse 検証を行う。null 返しで呼び出し側に失敗を伝え、`as` cast による
 * 無検証昇格を排除する。信頼できない入力はすべてこの入口を通すこと。
 */
export function toUserId(value: string): UserId | null {
	if (value.length === 0) return null;
	return value as UserId;
}

export function toMealId(value: string): MealId | null {
	if (value.length === 0) return null;
	return value as MealId;
}

export function toFoodId(value: string): FoodId | null {
	if (value.length === 0) return null;
	return value as FoodId;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDateString(value: string): IsoDateString | null {
	if (!ISO_DATE_RE.test(value)) return null;
	const d = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(d.getTime())) return null;
	if (!d.toISOString().startsWith(value)) return null;
	return value as IsoDateString;
}

/**
 * Zod schema または `toXxx` parse で shape が保証済みの値に限り、
 * 再検証なしで Brand に昇格する。未検証値には絶対に使用しない。
 *
 * 呼び出し前の検証経路を読み手に示すために、使用箇所のすぐ上で parse を
 * 完了させ、parse 結果から連続して昇格させること。parse と昇格の間に
 * 複数ステップを挟むと監査性が落ちる。
 *
 * 検証経路が不明な値には `toUserId` / `toMealId` / `toFoodId` /
 * `toIsoDateString` などの parse 入口を使うこと。
 */
export function unsafeBrand<B extends string>() {
	return <T>(value: T): Brand<T, B> => value as Brand<T, B>;
}

// week_start は Adapter Lambda で DDB の sk=plan#<week_start> になる idempotent key。
// Client / Server / 異なる user TZ の間で同じ instant が同じ week_start に写像される
// 必要があるため、常に Asia/Tokyo で月曜を計算する。
const TZ = "Asia/Tokyo";

const WEEKDAY_TO_INDEX: Record<string, number> = {
	Mon: 0,
	Tue: 1,
	Wed: 2,
	Thu: 3,
	Fri: 4,
	Sat: 5,
	Sun: 6,
};

function formatJstParts(
	date: Date,
	options: Intl.DateTimeFormatOptions,
): (type: Intl.DateTimeFormatPartTypes) => string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: TZ,
		...options,
	}).formatToParts(date);
	return (type) => {
		const part = parts.find((p) => p.type === type);
		if (!part) throw new Error(`missing date part: ${type}`);
		return part.value;
	};
}

export function weekStartOf(date: Date): string {
	const get = formatJstParts(date, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		weekday: "short",
	});

	const year = Number(get("year"));
	const month = Number(get("month"));
	const day = Number(get("day"));
	const weekdayIndex = WEEKDAY_TO_INDEX[get("weekday")];
	if (weekdayIndex === undefined) {
		throw new Error(`unexpected weekday: ${get("weekday")}`);
	}

	// Asia/Tokyo 基準の日付を UTC の Date として構築して月曜まで戻し、string 化する。
	// setUTCDate の自動桁上げ / 桁下げで月末・年末境界も自動処理される。
	const monday = new Date(Date.UTC(year, month - 1, day - weekdayIndex));
	const mYear = monday.getUTCFullYear();
	const mMonth = String(monday.getUTCMonth() + 1).padStart(2, "0");
	const mDay = String(monday.getUTCDate()).padStart(2, "0");
	return `${mYear}-${mMonth}-${mDay}`;
}

/**
 * 現在時刻を `Asia/Tokyo` で `YYYY-MM-DD` に整形する。
 * Intl の part 欠落は `formatJstParts` 内で throw されるため、
 * 呼び出し元は空文字 fallback を持つ必要がない (Fail Fast)。
 */
export function todayJstString(now: Date = new Date()): string {
	const get = formatJstParts(now, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
	return `${get("year")}-${get("month")}-${get("day")}`;
}

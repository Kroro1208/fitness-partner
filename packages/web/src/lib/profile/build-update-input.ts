import type { UserProfile } from "@fitness/contracts-ts";

export type ProfileField = keyof UserProfile;

/**
 * プロフィール表示用データ。永続化済みフィールドは optional。
 * `null` は「以前 PATCH で明示的にクリアされた」状態を表す。
 */
export type ProfileData = {
	[K in ProfileField]?: UserProfile[K] | null;
};

/**
 * buildUpdateInput の中間 / 出力型。
 *
 * 各フィールドは `string | number | null` のいずれかを取る:
 *  - string: enum 値や name
 *  - number: age / 単位値 (kg, cm, h)
 *  - null:   PATCH によるクリア
 *
 * UserProfile[K] のインデックスアクセスを書き込み側で使うと
 * union キーが intersection 計算され `never` になるため、
 * 値型を平坦な union として扱う。後段で UpdateUserProfileInputSchema が
 * フィールドごとに runtime 検証するため、ここでは緩い型で受ける。
 */
type ProfileFieldValue = string | number | null;

export type BuildUpdateResult =
	| { ok: true; value: Partial<Record<ProfileField, ProfileFieldValue>> }
	| { ok: false; error: { field: ProfileField; message: string } };

const NUMERIC_FIELDS = new Set<ProfileField>([
	"age",
	"height_cm",
	"weight_kg",
	"sleep_hours",
]);

export function buildUpdateInput(
	fields: readonly ProfileField[],
	values: Partial<Record<ProfileField, string>>,
	original: ProfileData,
): BuildUpdateResult {
	const input: Partial<Record<ProfileField, ProfileFieldValue>> = {};
	for (const field of fields) {
		const raw = values[field]?.trim();
		const originalValue = original[field];
		if (raw === "" || raw === undefined) {
			if (originalValue !== null && originalValue !== undefined) {
				input[field] = null;
			}
			continue;
		}
		if (NUMERIC_FIELDS.has(field)) {
			const num = Number(raw);
			// Number() は "Infinity" / "" / "1e999" 等を NaN 以外に通すため
			// isFinite で厳密チェックする。range 検証は境界 (Zod schema) に委ねる。
			if (!Number.isFinite(num)) {
				return {
					ok: false,
					error: {
						field,
						message: `${field} は数値で入力してください`,
					},
				};
			}
			input[field] = num;
			continue;
		}
		input[field] = raw;
	}
	return { ok: true, value: input };
}

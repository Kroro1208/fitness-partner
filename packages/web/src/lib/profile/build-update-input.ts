import type { OnboardingProfilePatch } from "@/lib/profile/profile-mappers";

export type ProfileField =
	| "age"
	| "sex"
	| "heightCm"
	| "weightKg"
	| "activityLevel"
	| "desiredPace"
	| "sleepHours"
	| "stressLevel";

/**
 * プロフィール表示用データ。永続化済みフィールドは optional。
 * `null` は「以前 PATCH で明示的にクリアされた」状態を表す。
 *
 * camelCase ViewModel に統一 (Task E1 で snake→camel に変換)。
 */
export type ProfileData = Pick<OnboardingProfilePatch, ProfileField>;

/**
 * buildUpdateInput の中間 / 出力型。
 *
 * 各フィールドは `OnboardingProfilePatch` の対応型だけを取る。
 * 編集フォームで受けた文字列はここで field ごとに parse し、
 * 呼び出し側が `as` で patch 型へ押し込むのを防ぐ。
 */
type EditableProfilePatch = Pick<OnboardingProfilePatch, ProfileField>;

export type BuildUpdateResult =
	| { ok: true; value: Partial<EditableProfilePatch> }
	| { ok: false; error: { field: ProfileField; message: string } };

const SEX_VALUES = ["male", "female"] as const;
const ACTIVITY_LEVEL_VALUES = [
	"sedentary",
	"lightly_active",
	"moderately_active",
	"very_active",
	"extremely_active",
] as const;
const DESIRED_PACE_VALUES = ["steady", "aggressive"] as const;
const STRESS_LEVEL_VALUES = ["low", "moderate", "high"] as const;

type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function assignField<K extends ProfileField>(
	target: Partial<EditableProfilePatch>,
	field: K,
	value: EditableProfilePatch[K],
) {
	target[field] = value;
}

function parseNumberField(
	field: "age" | "heightCm" | "weightKg" | "sleepHours",
	raw: string,
): ParseResult<number> {
	const num = Number(raw);
	// Number() は "Infinity" / "" / "1e999" 等を NaN 以外に通すため
	// isFinite で厳密チェックする。range 検証は境界 (Zod schema) に委ねる。
	if (!Number.isFinite(num)) {
		return {
			ok: false,
			message: `${field} は数値で入力してください`,
		};
	}

	return { ok: true, value: num };
}

function parseLiteralField<T extends string>(
	field: ProfileField,
	raw: string,
	allowed: readonly T[],
): ParseResult<T> {
	const matched = allowed.find((candidate) => candidate === raw);
	if (matched === undefined) {
		return {
			ok: false,
			message: `${field} の値が不正です`,
		};
	}

	return { ok: true, value: matched };
}

const FIELD_PARSERS: {
	[K in ProfileField]: (
		raw: string,
	) => ParseResult<NonNullable<EditableProfilePatch[K]>>;
} = {
	age: (raw) => parseNumberField("age", raw),
	sex: (raw) => parseLiteralField("sex", raw, SEX_VALUES),
	heightCm: (raw) => parseNumberField("heightCm", raw),
	weightKg: (raw) => parseNumberField("weightKg", raw),
	activityLevel: (raw) =>
		parseLiteralField("activityLevel", raw, ACTIVITY_LEVEL_VALUES),
	desiredPace: (raw) =>
		parseLiteralField("desiredPace", raw, DESIRED_PACE_VALUES),
	sleepHours: (raw) => parseNumberField("sleepHours", raw),
	stressLevel: (raw) =>
		parseLiteralField("stressLevel", raw, STRESS_LEVEL_VALUES),
};

function parseFieldValue<K extends ProfileField>(
	field: K,
	raw: string,
): ParseResult<NonNullable<EditableProfilePatch[K]>> {
	return FIELD_PARSERS[field](raw);
}

export function buildUpdateInput(
	fields: readonly ProfileField[],
	values: Partial<Record<ProfileField, string>>,
	original: ProfileData,
): BuildUpdateResult {
	const input: Partial<EditableProfilePatch> = {};
	for (const field of fields) {
		const raw = values[field]?.trim();
		const originalValue = original[field];
		if (raw === "" || raw === undefined) {
			if (originalValue !== null && originalValue !== undefined) {
				assignField(input, field, null);
			}
			continue;
		}

		const parsed = parseFieldValue(field, raw);
		if (!parsed.ok) {
			return {
				ok: false,
				error: {
					field,
					message: parsed.message,
				},
			};
		}

		assignField(input, field, parsed.value);
	}
	return { ok: true, value: input };
}

import type { UpdateUserProfileInput } from "../../../packages/contracts-ts/generated/types";
import type { ProfilePatch } from "./types";
import { isInRange, isRecord, isValidEnum } from "./validation";

type Sex = NonNullable<UpdateUserProfileInput["sex"]>;
type ActivityLevel = NonNullable<UpdateUserProfileInput["activity_level"]>;
type DesiredPace = NonNullable<UpdateUserProfileInput["desired_pace"]>;
type StressLevel = NonNullable<UpdateUserProfileInput["stress_level"]>;

const VALID_SEX = {
	male: true,
	female: true,
} as const satisfies Readonly<Record<Sex, true>>;
const VALID_ACTIVITY_LEVEL = {
	sedentary: true,
	lightly_active: true,
	moderately_active: true,
	very_active: true,
	extremely_active: true,
} as const satisfies Readonly<Record<ActivityLevel, true>>;
const VALID_DESIRED_PACE = {
	steady: true,
	aggressive: true,
} as const satisfies Readonly<Record<DesiredPace, true>>;
const VALID_STRESS_LEVEL = {
	low: true,
	moderate: true,
	high: true,
} as const satisfies Readonly<Record<StressLevel, true>>;

type ValidationResult =
	| { valid: true; data: ProfilePatch }
	| { valid: false; message: string };

/**
 * 手書き if ガード。参照元: UpdateUserProfileInput.schema.json
 * contracts-py 側の Pydantic モデルと同じ境界値を強制する。
 */
export function validateUpdateProfileInput(body: unknown): ValidationResult {
	if (!isRecord(body)) {
		return { valid: false, message: "Request body must be a JSON object" };
	}

	const data: ProfilePatch = {};

	if (body.name !== undefined && body.name !== null) {
		if (typeof body.name !== "string") {
			return { valid: false, message: "name must be a string" };
		}
		data.name = body.name;
	}

	if (body.age !== undefined && body.age !== null) {
		if (typeof body.age !== "number" || !Number.isInteger(body.age)) {
			return { valid: false, message: "age must be an integer" };
		}
		if (body.age < 18 || body.age > 120) {
			return { valid: false, message: "age must be between 18 and 120" };
		}
		data.age = body.age;
	}

	if (body.sex !== undefined && body.sex !== null) {
		if (!isValidEnum(body.sex, VALID_SEX)) {
			return { valid: false, message: "sex must be 'male' or 'female'" };
		}
		data.sex = body.sex;
	}

	if (body.height_cm !== undefined && body.height_cm !== null) {
		if (!isInRange(body.height_cm, { gt: 0, lt: 300 })) {
			return { valid: false, message: "height_cm must be > 0 and < 300" };
		}
		data.height_cm = body.height_cm;
	}

	if (body.weight_kg !== undefined && body.weight_kg !== null) {
		if (!isInRange(body.weight_kg, { gt: 0, lt: 500 })) {
			return { valid: false, message: "weight_kg must be > 0 and < 500" };
		}
		data.weight_kg = body.weight_kg;
	}

	if (body.activity_level !== undefined && body.activity_level !== null) {
		if (!isValidEnum(body.activity_level, VALID_ACTIVITY_LEVEL)) {
			return { valid: false, message: "Invalid activity_level" };
		}
		data.activity_level = body.activity_level;
	}

	if (body.desired_pace !== undefined && body.desired_pace !== null) {
		if (!isValidEnum(body.desired_pace, VALID_DESIRED_PACE)) {
			return { valid: false, message: "Invalid desired_pace" };
		}
		data.desired_pace = body.desired_pace;
	}

	if (body.sleep_hours !== undefined && body.sleep_hours !== null) {
		if (!isInRange(body.sleep_hours, { ge: 0, le: 24 })) {
			return { valid: false, message: "sleep_hours must be between 0 and 24" };
		}
		data.sleep_hours = body.sleep_hours;
	}

	if (body.stress_level !== undefined && body.stress_level !== null) {
		if (!isValidEnum(body.stress_level, VALID_STRESS_LEVEL)) {
			return { valid: false, message: "Invalid stress_level" };
		}
		data.stress_level = body.stress_level;
	}

	if (Object.keys(data).length === 0) {
		return { valid: false, message: "At least one field must be provided" };
	}

	return { valid: true, data };
}

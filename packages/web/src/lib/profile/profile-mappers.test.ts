import type { UserProfile } from "@fitness/contracts-ts";
import { describe, expect, it } from "vitest";

import {
	FIELD_MAP_CAMEL_TO_SNAKE,
	FIELD_MAP_SNAKE_TO_CAMEL,
	noteFieldToProfileKey,
	toCoachPromptRequestDto,
	toFreeTextParseRequestDto,
	toOnboardingProfile,
	toProfilePatchDto,
	toProfileSnapshotCacheKey,
} from "./profile-mappers";

describe("FIELD_MAP", () => {
	it("snake→camel と camel→snake が互いの逆写像である", () => {
		for (const [snake, camel] of Object.entries(FIELD_MAP_SNAKE_TO_CAMEL)) {
			expect(FIELD_MAP_CAMEL_TO_SNAKE[camel]).toBe(snake);
		}
	});

	it("UserProfile の 43 業務フィールド + updated_at を網羅する", () => {
		// 43 業務フィールド (UserProfile.schema.json) + updated_at = 44
		expect(Object.keys(FIELD_MAP_SNAKE_TO_CAMEL)).toHaveLength(44);
	});
});

describe("toOnboardingProfile", () => {
	it("null を受け取ったら null を返す", () => {
		expect(toOnboardingProfile(null)).toBeNull();
	});

	it("snake_case 全フィールドを camelCase に変換する", () => {
		const snake: UserProfile = {
			name: "Alice",
			age: 30,
			sex: "female",
			height_cm: 160,
			weight_kg: 55,
			onboarding_stage: "stats",
			is_pregnant_or_breastfeeding: false,
			lifestyle_note: "note",
			updated_at: "2026-04-19T00:00:00Z",
		};
		const camel = toOnboardingProfile(snake);
		expect(camel).toEqual({
			name: "Alice",
			age: 30,
			sex: "female",
			heightCm: 160,
			weightKg: 55,
			onboardingStage: "stats",
			isPregnantOrBreastfeeding: false,
			lifestyleNote: "note",
			updatedAt: "2026-04-19T00:00:00Z",
		});
	});

	it("未知のキーは無視する (forward-compat)", () => {
		const snake = { age: 25, unknown_field: "x" };
		const camel = toOnboardingProfile(snake);
		expect(camel).toEqual({ age: 25 });
	});

	it("null 値は保持する (明示的クリアのセマンティクス)", () => {
		const snake: UserProfile = { weight_kg: null };
		const camel = toOnboardingProfile(snake);
		expect(camel).toEqual({ weightKg: null });
	});
});

describe("toProfilePatchDto", () => {
	it("camelCase patch を snake_case DTO に変換する", () => {
		const dto = toProfilePatchDto({
			age: 30,
			heightCm: 170,
			isPregnantOrBreastfeeding: false,
			onboardingStage: "stats",
		});
		expect(dto).toEqual({
			age: 30,
			height_cm: 170,
			is_pregnant_or_breastfeeding: false,
			onboarding_stage: "stats",
		});
	});

	it("undefined フィールドは出力から除外する", () => {
		const dto = toProfilePatchDto({ age: 30, heightCm: undefined });
		expect(dto).toEqual({ age: 30 });
		expect("height_cm" in dto).toBe(false);
	});

	it("null フィールドは保持する (クリア指示)", () => {
		const dto = toProfilePatchDto({ weightKg: null });
		expect(dto).toEqual({ weight_kg: null });
	});

	it("未知の camelCase キーは無視する", () => {
		const input: Partial<Parameters<typeof toProfilePatchDto>[0]> & {
			bogusField: string;
		} = {
			age: 30,
			bogusField: "ignored",
		};
		const dto = toProfilePatchDto(input);
		expect(dto).toEqual({ age: 30 });
	});
});

describe("toCoachPromptRequestDto", () => {
	it("snapshot を snake_case に変換した上で target_stage と共に返す", () => {
		const dto = toCoachPromptRequestDto("lifestyle", {
			age: 30,
			heightCm: 170,
			sleepHours: 7,
		});
		expect(dto).toEqual({
			target_stage: "lifestyle",
			profile_snapshot: {
				age: 30,
				height_cm: 170,
				sleep_hours: 7,
			},
		});
	});

	it("undefined フィールドは snapshot から落とす", () => {
		const dto = toCoachPromptRequestDto("stats", {
			age: 30,
			heightCm: undefined,
		});
		expect(dto.profile_snapshot).toEqual({ age: 30 });
	});
});

describe("toProfileSnapshotCacheKey", () => {
	it("snapshot のキー順に依存せず同じキャッシュキーを返す", () => {
		const left = toProfileSnapshotCacheKey({
			sleepHours: 7,
			age: 30,
		});
		const right = toProfileSnapshotCacheKey({
			age: 30,
			sleepHours: 7,
		});
		expect(left).toBe(right);
	});

	it("snapshot が変わると別のキャッシュキーを返す", () => {
		const before = toProfileSnapshotCacheKey({ age: 30 });
		const after = toProfileSnapshotCacheKey({ age: 31 });
		expect(before).not.toBe(after);
	});
});

describe("toFreeTextParseRequestDto", () => {
	it("snapshot を snake_case に変換した上で stage / free_text と共に返す", () => {
		const dto = toFreeTextParseRequestDto("lifestyle", "週3でジム行きます", {
			age: 30,
			workoutsPerWeek: 3,
		});
		expect(dto).toEqual({
			stage: "lifestyle",
			free_text: "週3でジム行きます",
			structured_snapshot: {
				age: 30,
				workouts_per_week: 3,
			},
		});
	});
});

describe("noteFieldToProfileKey", () => {
	it("lifestyle_note → lifestyleNote", () => {
		expect(noteFieldToProfileKey("lifestyle_note")).toBe("lifestyleNote");
	});

	it("preferences_note → preferencesNote", () => {
		expect(noteFieldToProfileKey("preferences_note")).toBe("preferencesNote");
	});

	it("snacks_note → snacksNote", () => {
		expect(noteFieldToProfileKey("snacks_note")).toBe("snacksNote");
	});
});

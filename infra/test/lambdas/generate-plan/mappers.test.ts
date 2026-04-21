import type { CompleteProfileForPlan } from "@fitness/contracts-ts";
import { describe, expect, it } from "vitest";
import {
	type ActivityLevel,
	deriveActivityLevel,
	deriveAvgWorkoutMinutes,
	type JobType,
	toSafeAgentInput,
	toSafePromptProfile,
} from "../../../lambdas/generate-plan/mappers";

function makeProfile(
	overrides: Record<string, unknown> = {},
): CompleteProfileForPlan {
	// CompleteProfileForPlan は `[k: string]: unknown` index signature を持つので
	// 未知フィールドを含んだ spread もそのまま assign できる。
	return {
		onboarding_stage: "complete",
		age: 30,
		sex: "male",
		height_cm: 170,
		weight_kg: 70,
		sleep_hours: 7,
		stress_level: "low",
		job_type: "desk",
		workouts_per_week: 3,
		...overrides,
	};
}

describe("deriveActivityLevel", () => {
	const cases = [
		{ w: 0, j: "desk", e: "sedentary" },
		{ w: 0, j: "manual_labour", e: "lightly_active" },
		{ w: 1, j: "desk", e: "lightly_active" },
		{ w: 2, j: "outdoor", e: "lightly_active" },
		{ w: 3, j: "desk", e: "moderately_active" },
		{ w: 4, j: "manual_labour", e: "very_active" },
		{ w: 5, j: "desk", e: "very_active" },
		{ w: 7, j: "desk", e: "extremely_active" },
	] as const satisfies readonly { w: number; j: JobType; e: ActivityLevel }[];
	for (const c of cases) {
		it(`w=${c.w} j=${c.j} → ${c.e}`, () => {
			expect(deriveActivityLevel(c.w, c.j)).toBe(c.e);
		});
	}
});

describe("deriveAvgWorkoutMinutes", () => {
	it("デフォルト 45", () => expect(deriveAvgWorkoutMinutes([], 0)).toBe(45));
	it("筋トレ + 高頻度 60", () =>
		expect(deriveAvgWorkoutMinutes(["weightlifting"], 4)).toBe(60));
	it("空 + workouts>=3 → 30", () =>
		expect(deriveAvgWorkoutMinutes([], 3)).toBe(30));
});

describe("toSafePromptProfile", () => {
	const profile = makeProfile({
		medical_condition_note: "糖尿病疑い",
		medication_note: "メトホルミン",
		has_medical_condition: true,
		has_doctor_diet_restriction: false,
		has_eating_disorder_history: false,
		alcohol_per_week: "none",
	});
	it("medical_*_note ドロップ", () => {
		const s = toSafePromptProfile(profile);
		// SafePromptProfile 型には medical_*_note が存在しないので、Object.hasOwn で
		// フィールド不在を確認する (型バイパス不要)。
		expect(Object.hasOwn(s, "medical_condition_note")).toBe(false);
		expect(Object.hasOwn(s, "medication_note")).toBe(false);
	});
	it("抽象フラグ集約", () => {
		const s = toSafePromptProfile(profile);
		expect(s.avoid_supplements_without_consultation).toBe(true);
		expect(s.avoid_alcohol).toBe(true);
	});
});

describe("toSafeAgentInput", () => {
	it("protein_gap_g 固定 0", () => {
		const input = toSafeAgentInput(
			makeProfile({
				workout_types: [],
				alcohol_per_week: null,
			}),
		);
		expect(input.supplement_input.protein_gap_g).toBe(0);
		expect(input.calorie_macro_input.activity_level).toBe("moderately_active");
		expect(input.hydration_input.avg_workout_minutes).toBe(30);
	});
	it("low_sunlight_exposure MVP 固定 false", () => {
		const input = toSafeAgentInput(
			makeProfile({
				workout_types: [],
				alcohol_per_week: null,
				location_region: "北海道",
			}),
		);
		expect(input.supplement_input.low_sunlight_exposure).toBe(false);
	});
});

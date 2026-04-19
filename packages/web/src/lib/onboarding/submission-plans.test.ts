import { describe, expect, it } from "vitest";

import { buildAdvancePlan, buildSafetyAdvancePlan } from "./submission-plans";

describe("buildAdvancePlan", () => {
	it("builds a review plan when returning from the review flow", () => {
		// Arrange
		const profile = {
			onboardingStage: "review" as const,
			jobType: "desk" as const,
		};
		const basePatch = { sleepHours: 7 };

		// Act
		const plan = buildAdvancePlan({
			profile,
			basePatch,
			fallbackNextStage: "preferences",
			returnToReview: true,
		});

		// Assert
		expect(plan.nextStage).toBe("review");
		expect(plan.redirectPath).toBe("/onboarding/review");
		expect(plan.coachPromptPrefetch).toEqual({
			targetStage: "review",
			snapshot: { onboardingStage: "review", jobType: "desk", sleepHours: 7 },
		});
		expect(plan.freeTextParse).toBeNull();
	});

	it("adds a free-text parse plan only when the input is non-empty", () => {
		// Arrange
		const profile = { currentSnacks: ["nuts"] };
		const basePatch = { snackingReason: "habit" as const };

		// Act
		const plan = buildAdvancePlan({
			profile,
			basePatch,
			fallbackNextStage: "feasibility",
			freeText: {
				stage: "snacks",
				value: "夜に甘いものを食べがち",
			},
		});

		// Assert
		expect(plan.nextStage).toBe("feasibility");
		expect(plan.redirectPath).toBe("/onboarding/feasibility");
		expect(plan.freeTextParse).toEqual({
			stage: "snacks",
			freeText: "夜に甘いものを食べがち",
			snapshot: {
				currentSnacks: ["nuts"],
				snackingReason: "habit",
			},
		});
	});

	it("skips free-text parsing when the input is blank", () => {
		// Arrange / Act
		const plan = buildAdvancePlan({
			profile: null,
			basePatch: { foodAdventurousness: 5 },
			fallbackNextStage: "snacks",
			freeText: {
				stage: "preferences",
				value: "   ",
			},
		});

		// Assert
		expect(plan.freeTextParse).toBeNull();
	});
});

describe("buildSafetyAdvancePlan", () => {
	it("builds a blocked plan when the answers require blocking", () => {
		// Arrange
		const answers = {
			hasMedicalCondition: false,
			isUnderTreatment: false,
			onMedication: false,
			isPregnantOrBreastfeeding: true,
			hasDoctorDietRestriction: false,
			hasEatingDisorderHistory: false,
		};

		// Act
		const plan = buildSafetyAdvancePlan({
			answers,
			medicalConditionNote: " ",
			medicationNote: " ",
		});

		// Assert
		expect(plan.nextStage).toBe("blocked");
		expect(plan.redirectPath).toBe("/onboarding/blocked");
		expect(plan.basePatch).toMatchObject({
			isPregnantOrBreastfeeding: true,
			blockedReason: "pregnancy_or_breastfeeding",
			medicalConditionNote: null,
			medicationNote: null,
		});
		expect(plan.coachPromptPrefetch).toBeNull();
	});

	it("builds a stats plan and normalizes optional notes", () => {
		// Arrange
		const answers = {
			hasMedicalCondition: true,
			isUnderTreatment: false,
			onMedication: true,
			isPregnantOrBreastfeeding: false,
			hasDoctorDietRestriction: false,
			hasEatingDisorderHistory: false,
		};

		// Act
		const plan = buildSafetyAdvancePlan({
			answers,
			medicalConditionNote: "  高血圧  ",
			medicationNote: "\t",
		});

		// Assert
		expect(plan.nextStage).toBe("stats");
		expect(plan.redirectPath).toBe("/onboarding/stats");
		expect(plan.basePatch).toEqual({
			hasMedicalCondition: true,
			isUnderTreatment: false,
			onMedication: true,
			isPregnantOrBreastfeeding: false,
			hasDoctorDietRestriction: false,
			hasEatingDisorderHistory: false,
			medicalConditionNote: "高血圧",
			medicationNote: null,
		});
		expect(plan.coachPromptPrefetch).toEqual({
			targetStage: "stats",
			snapshot: plan.basePatch,
		});
	});
});

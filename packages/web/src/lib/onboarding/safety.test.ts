import { describe, expect, it } from "vitest";
import { evaluateSafetyRisk, type SafetyInput } from "./safety";

const baseInput: SafetyInput = {
	hasMedicalCondition: false,
	isUnderTreatment: false,
	onMedication: false,
	isPregnantOrBreastfeeding: false,
	hasDoctorDietRestriction: false,
	hasEatingDisorderHistory: false,
	medicalConditionNote: null,
	medicationNote: null,
};

describe("evaluateSafetyRisk", () => {
	it("returns safe when all flags are false", () => {
		const r = evaluateSafetyRisk(baseInput);
		expect(r.level).toBe("safe");
	});

	it("blocked for pregnancy", () => {
		const r = evaluateSafetyRisk({
			...baseInput,
			isPregnantOrBreastfeeding: true,
		});
		expect(r.level).toBe("blocked");
		expect(r.blockedReason).toContain("pregnancy");
	});

	it("blocked for eating disorder", () => {
		const r = evaluateSafetyRisk({
			...baseInput,
			hasEatingDisorderHistory: true,
		});
		expect(r.level).toBe("blocked");
	});

	it("blocked for doctor diet restriction", () => {
		const r = evaluateSafetyRisk({
			...baseInput,
			hasDoctorDietRestriction: true,
		});
		expect(r.level).toBe("blocked");
	});

	it("caution for medical condition", () => {
		const r = evaluateSafetyRisk({ ...baseInput, hasMedicalCondition: true });
		expect(r.level).toBe("caution");
	});

	it("blocked takes priority over caution", () => {
		const r = evaluateSafetyRisk({
			...baseInput,
			hasMedicalCondition: true,
			isPregnantOrBreastfeeding: true,
		});
		expect(r.level).toBe("blocked");
	});
});

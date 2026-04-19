import { describe, expect, it } from "vitest";
import {
	evaluateSafetyGuard,
	type SafetyInput,
} from "../../../lambdas/shared/onboarding-safety";

const safe: SafetyInput = {
	has_medical_condition: false,
	is_under_treatment: false,
	on_medication: false,
	is_pregnant_or_breastfeeding: false,
	has_doctor_diet_restriction: false,
	has_eating_disorder_history: false,
};

describe("evaluateSafetyGuard", () => {
	it("returns safe for all false", () => {
		const r = evaluateSafetyGuard(safe);
		expect(r.level).toBe("safe");
	});

	it("returns blocked for pregnancy", () => {
		const r = evaluateSafetyGuard({
			...safe,
			is_pregnant_or_breastfeeding: true,
		});
		expect(r.level).toBe("blocked");
		expect(r.reasons).toContain("pregnancy_or_breastfeeding");
	});

	it("returns blocked for eating disorder history", () => {
		const r = evaluateSafetyGuard({
			...safe,
			has_eating_disorder_history: true,
		});
		expect(r.level).toBe("blocked");
		expect(r.reasons).toContain("eating_disorder_history");
	});

	it("returns blocked for doctor diet restriction", () => {
		const r = evaluateSafetyGuard({
			...safe,
			has_doctor_diet_restriction: true,
		});
		expect(r.level).toBe("blocked");
		expect(r.reasons).toContain("doctor_diet_restriction");
	});

	it("returns caution for medical condition only", () => {
		const r = evaluateSafetyGuard({ ...safe, has_medical_condition: true });
		expect(r.level).toBe("caution");
	});

	it("returns caution for medication only", () => {
		const r = evaluateSafetyGuard({ ...safe, on_medication: true });
		expect(r.level).toBe("caution");
	});

	it("blocked takes priority over caution", () => {
		const r = evaluateSafetyGuard({
			...safe,
			has_medical_condition: true,
			is_pregnant_or_breastfeeding: true,
		});
		expect(r.level).toBe("blocked");
	});
});

export type SafetyInput = {
	hasMedicalCondition: boolean;
	isUnderTreatment: boolean;
	onMedication: boolean;
	isPregnantOrBreastfeeding: boolean;
	hasDoctorDietRestriction: boolean;
	hasEatingDisorderHistory: boolean;
	medicalConditionNote: string | null;
	medicationNote: string | null;
};

export type SafetyResult =
	| { level: "safe"; blockedReason: null; reasons: []; warnings: [] }
	| {
			level: "caution";
			blockedReason: null;
			reasons: [];
			warnings: string[];
	  }
	| {
			level: "blocked";
			blockedReason: string;
			reasons: string[];
			warnings: [];
	  };

export function evaluateSafetyRisk(input: SafetyInput): SafetyResult {
	const blockedReasons = [
		input.isPregnantOrBreastfeeding ? "pregnancy_or_breastfeeding" : undefined,
		input.hasEatingDisorderHistory ? "eating_disorder_history" : undefined,
		input.hasDoctorDietRestriction ? "doctor_diet_restriction" : undefined,
	].filter((reason): reason is string => reason !== undefined);

	if (blockedReasons.length > 0) {
		return {
			level: "blocked",
			blockedReason: blockedReasons.join("; "),
			reasons: blockedReasons,
			warnings: [],
		};
	}

	const warnings = [
		input.hasMedicalCondition ? "medical_condition" : undefined,
		input.onMedication ? "on_medication" : undefined,
	].filter((warning): warning is string => warning !== undefined);

	if (warnings.length > 0) {
		return { level: "caution", blockedReason: null, reasons: [], warnings };
	}

	return { level: "safe", blockedReason: null, reasons: [], warnings: [] };
}

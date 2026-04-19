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
	const blockedReasons: string[] = [];
	if (input.isPregnantOrBreastfeeding)
		blockedReasons.push("pregnancy_or_breastfeeding");
	if (input.hasEatingDisorderHistory)
		blockedReasons.push("eating_disorder_history");
	if (input.hasDoctorDietRestriction)
		blockedReasons.push("doctor_diet_restriction");

	if (blockedReasons.length > 0) {
		return {
			level: "blocked",
			blockedReason: blockedReasons.join("; "),
			reasons: blockedReasons,
			warnings: [],
		};
	}

	const warnings: string[] = [];
	if (input.hasMedicalCondition) warnings.push("medical_condition");
	if (input.onMedication) warnings.push("on_medication");

	if (warnings.length > 0) {
		return { level: "caution", blockedReason: null, reasons: [], warnings };
	}

	return { level: "safe", blockedReason: null, reasons: [], warnings: [] };
}

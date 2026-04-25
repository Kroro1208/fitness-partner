export type SafetyInput = {
	has_medical_condition: boolean;
	is_under_treatment: boolean;
	on_medication: boolean;
	is_pregnant_or_breastfeeding: boolean;
	has_doctor_diet_restriction: boolean;
	has_eating_disorder_history: boolean;
};

export type SafetyResult =
	| { level: "safe"; reasons: []; warnings: [] }
	| { level: "caution"; reasons: []; warnings: string[] }
	| { level: "blocked"; reasons: string[]; warnings: [] };

export function evaluateSafetyGuard(input: SafetyInput): SafetyResult {
	const blockedReasons = [
		input.is_pregnant_or_breastfeeding
			? "pregnancy_or_breastfeeding"
			: undefined,
		input.has_eating_disorder_history ? "eating_disorder_history" : undefined,
		input.has_doctor_diet_restriction ? "doctor_diet_restriction" : undefined,
	].filter((reason): reason is string => reason !== undefined);

	if (blockedReasons.length > 0) {
		return { level: "blocked", reasons: blockedReasons, warnings: [] };
	}

	const warnings = [
		input.has_medical_condition ? "medical_condition" : undefined,
		input.on_medication ? "on_medication" : undefined,
	].filter((warning): warning is string => warning !== undefined);

	if (warnings.length > 0) {
		return { level: "caution", reasons: [], warnings };
	}

	return { level: "safe", reasons: [], warnings: [] };
}

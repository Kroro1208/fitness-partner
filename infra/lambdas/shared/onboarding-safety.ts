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
	const blockedReasons: string[] = [];
	if (input.is_pregnant_or_breastfeeding)
		blockedReasons.push("pregnancy_or_breastfeeding");
	if (input.has_eating_disorder_history)
		blockedReasons.push("eating_disorder_history");
	if (input.has_doctor_diet_restriction)
		blockedReasons.push("doctor_diet_restriction");

	if (blockedReasons.length > 0) {
		return { level: "blocked", reasons: blockedReasons, warnings: [] };
	}

	const warnings: string[] = [];
	if (input.has_medical_condition) warnings.push("medical_condition");
	if (input.on_medication) warnings.push("on_medication");

	if (warnings.length > 0) {
		return { level: "caution", reasons: [], warnings };
	}

	return { level: "safe", reasons: [], warnings: [] };
}

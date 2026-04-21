import {
	type FreeTextStage,
	hasNonBlankFreeText,
} from "@/lib/onboarding/free-text";
import { evaluateSafetyRisk } from "@/lib/onboarding/safety";
import {
	type OnboardingStage,
	pathForStage,
} from "@/lib/onboarding/stage-routing";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";
import { trimmedOrNull } from "@/lib/utils";

type ProfileSnapshot = Partial<OnboardingProfile>;
type CoachPromptPrefetchPlan = {
	targetStage: OnboardingStage;
	snapshot: ProfileSnapshot;
};
type FreeTextParsePlan = {
	stage: FreeTextStage;
	freeText: string;
	snapshot: ProfileSnapshot;
};

type OnboardingTransitionPlan = {
	basePatch: Partial<OnboardingProfile>;
	nextStage: OnboardingStage | "complete";
	redirectPath: string;
	freeTextParse: FreeTextParsePlan | null;
};

export type OnboardingAdvancePlan = OnboardingTransitionPlan & {
	coachPromptPrefetch: CoachPromptPrefetchPlan;
};

export type SafetyAdvancePlan = OnboardingTransitionPlan & {
	coachPromptPrefetch: CoachPromptPrefetchPlan | null;
};

export type SafetyAnswers = {
	hasMedicalCondition: boolean | null;
	isUnderTreatment: boolean | null;
	onMedication: boolean | null;
	isPregnantOrBreastfeeding: boolean | null;
	hasDoctorDietRestriction: boolean | null;
	hasEatingDisorderHistory: boolean | null;
};

type BuildAdvancePlanInput = {
	profile: OnboardingProfile | null | undefined;
	basePatch: Partial<OnboardingProfile>;
	fallbackNextStage: OnboardingStage;
	returnToReview?: boolean;
	freeText?:
		| {
				stage: FreeTextStage;
				value: string;
		  }
		| undefined;
};

function buildSnapshot(
	profile: OnboardingProfile | null | undefined,
	basePatch: Partial<OnboardingProfile>,
): ProfileSnapshot {
	return {
		...profile,
		...basePatch,
	};
}

export function buildAdvancePlan({
	profile,
	basePatch,
	fallbackNextStage,
	returnToReview = false,
	freeText,
}: BuildAdvancePlanInput): OnboardingAdvancePlan {
	const nextStage = returnToReview ? "review" : fallbackNextStage;
	const snapshot = buildSnapshot(profile, basePatch);

	return {
		basePatch,
		nextStage,
		redirectPath:
			nextStage === "review" ? "/onboarding/review" : pathForStage(nextStage),
		coachPromptPrefetch: {
			targetStage: nextStage,
			snapshot,
		},
		freeTextParse:
			freeText !== undefined && hasNonBlankFreeText(freeText.value)
				? {
						stage: freeText.stage,
						freeText: freeText.value,
						snapshot,
					}
				: null,
	};
}

export function buildSafetyAdvancePlan(input: {
	answers: SafetyAnswers;
	medicalConditionNote: string;
	medicationNote: string;
}): SafetyAdvancePlan {
	const normalizedMedicalConditionNote = trimmedOrNull(
		input.medicalConditionNote,
	);
	const normalizedMedicationNote = trimmedOrNull(input.medicationNote);
	const basePatch: Partial<OnboardingProfile> = {
		hasMedicalCondition: input.answers.hasMedicalCondition,
		isUnderTreatment: input.answers.isUnderTreatment,
		onMedication: input.answers.onMedication,
		isPregnantOrBreastfeeding: input.answers.isPregnantOrBreastfeeding,
		hasDoctorDietRestriction: input.answers.hasDoctorDietRestriction,
		hasEatingDisorderHistory: input.answers.hasEatingDisorderHistory,
		medicalConditionNote: normalizedMedicalConditionNote,
		medicationNote: normalizedMedicationNote,
	};

	const safetyResult = evaluateSafetyRisk({
		hasMedicalCondition: !!input.answers.hasMedicalCondition,
		isUnderTreatment: !!input.answers.isUnderTreatment,
		onMedication: !!input.answers.onMedication,
		isPregnantOrBreastfeeding: !!input.answers.isPregnantOrBreastfeeding,
		hasDoctorDietRestriction: !!input.answers.hasDoctorDietRestriction,
		hasEatingDisorderHistory: !!input.answers.hasEatingDisorderHistory,
		medicalConditionNote: normalizedMedicalConditionNote,
		medicationNote: normalizedMedicationNote,
	});

	if (safetyResult.level === "blocked") {
		return {
			basePatch: {
				...basePatch,
				blockedReason: safetyResult.blockedReason,
			},
			nextStage: "blocked",
			redirectPath: "/onboarding/blocked",
			coachPromptPrefetch: null,
			freeTextParse: null,
		};
	}

	return {
		basePatch,
		nextStage: "stats",
		redirectPath: pathForStage("stats"),
		coachPromptPrefetch: {
			targetStage: "stats",
			snapshot: basePatch,
		},
		freeTextParse: null,
	};
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CoachPromptCard } from "@/components/domain/coach-prompt-card";
import { SegmentedControl } from "@/components/domain/segmented-control";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { coachPromptQueryOptions, useOnboarding } from "@/hooks/use-onboarding";
import { ONBOARDING_ERROR_MESSAGES } from "@/lib/onboarding/error-messages";
import {
	buildSafetyAdvancePlan,
	type SafetyAnswers,
} from "@/lib/onboarding/submission-plans";
import type { OnboardingProfile } from "@/lib/profile/profile-mappers";

const YES_NO = [
	{ value: "yes", label: "はい" },
	{ value: "no", label: "いいえ" },
];

type Flags = SafetyAnswers;

export function SafetyForm({
	initialProfile,
}: {
	initialProfile: OnboardingProfile | null;
}) {
	const router = useRouter();
	const { profile, patch, prefetchCoachPrompt, isPatching, patchError } =
		useOnboarding(initialProfile);

	const [flags, setFlags] = useState<Flags>({
		hasMedicalCondition: profile?.hasMedicalCondition ?? null,
		isUnderTreatment: profile?.isUnderTreatment ?? null,
		onMedication: profile?.onMedication ?? null,
		isPregnantOrBreastfeeding: profile?.isPregnantOrBreastfeeding ?? null,
		hasDoctorDietRestriction: profile?.hasDoctorDietRestriction ?? null,
		hasEatingDisorderHistory: profile?.hasEatingDisorderHistory ?? null,
	});
	const [medicalNote, setMedicalNote] = useState(
		profile?.medicalConditionNote ?? "",
	);
	const [medicationNote, setMedicationNote] = useState(
		profile?.medicationNote ?? "",
	);

	const coach = useQuery(coachPromptQueryOptions("safety", {}));

	const allAnswered = Object.values(flags).every((v) => v !== null);

	const handleNext = async () => {
		if (!allAnswered) return;

		const plan = buildSafetyAdvancePlan({
			answers: flags,
			medicalConditionNote: medicalNote,
			medicationNote,
		});
		if (plan.coachPromptPrefetch !== null) {
			prefetchCoachPrompt(
				plan.coachPromptPrefetch.targetStage,
				plan.coachPromptPrefetch.snapshot,
			);
		}
		// patch は mutate ベース。失敗時は mutation.error → patchError Alert で表示。
		// 成功時のみ onSuccess で遷移する。
		patch(plan.basePatch, plan.nextStage, {
			onSuccess: () => router.push(plan.redirectPath),
		});
	};

	const flagRow = (key: keyof Flags, label: string) => (
		<div className="flex items-center justify-between py-2">
			<Label>{label}</Label>
			<SegmentedControl
				value={flags[key] === null ? null : flags[key] ? "yes" : "no"}
				onChange={(v) => setFlags((f) => ({ ...f, [key]: v === "yes" }))}
				options={YES_NO}
				ariaLabel={label}
			/>
		</div>
	);

	return (
		<div className="space-y-6">
			<CoachPromptCard
				prompt={coach.data?.prompt ?? null}
				isLoading={coach.isLoading}
				isFallback={coach.data?.cached ?? false}
				isUnavailable={coach.isError}
			/>

			<section className="space-y-1 divide-y divide-neutral-100 bg-surface rounded-lg px-4">
				{flagRow("hasMedicalCondition", "持病はありますか")}
				{flagRow("isUnderTreatment", "通院中ですか")}
				{flagRow("onMedication", "服薬中ですか")}
				{flagRow("isPregnantOrBreastfeeding", "妊娠中または授乳中ですか")}
				{flagRow(
					"hasDoctorDietRestriction",
					"医師から食事制限を受けていますか",
				)}
				{flagRow("hasEatingDisorderHistory", "摂食障害の既往はありますか")}
			</section>

			{flags.hasMedicalCondition && (
				<div className="space-y-2">
					<Label htmlFor="medical-note">持病の内容 (任意)</Label>
					<Textarea
						id="medical-note"
						value={medicalNote}
						onChange={(e) => setMedicalNote(e.target.value)}
					/>
				</div>
			)}
			{flags.onMedication && (
				<div className="space-y-2">
					<Label htmlFor="medication-note">服薬の内容 (任意)</Label>
					<Textarea
						id="medication-note"
						value={medicationNote}
						onChange={(e) => setMedicationNote(e.target.value)}
					/>
				</div>
			)}

			{patchError && (
				<Alert className="border-danger-500 bg-danger-100">
					<AlertDescription>
						{ONBOARDING_ERROR_MESSAGES.patchFailedRetry}
					</AlertDescription>
				</Alert>
			)}

			<div className="flex justify-end">
				<Button onClick={handleNext} disabled={!allAnswered || isPatching}>
					{isPatching ? "保存中..." : "次へ"}
				</Button>
			</div>
		</div>
	);
}

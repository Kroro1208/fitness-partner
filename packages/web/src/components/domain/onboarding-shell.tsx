"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { Progress } from "@/components/ui/progress";
import {
	ONBOARDING_STAGE_ORDER,
	type OnboardingStage,
} from "@/lib/onboarding/stage-routing";

type OnboardingShellProps = {
	stage: OnboardingStage;
	backHref?: string;
	children: React.ReactNode;
};

export function OnboardingShell({
	stage,
	backHref,
	children,
}: OnboardingShellProps) {
	const stepIndex = ONBOARDING_STAGE_ORDER.indexOf(stage);
	const totalSteps = ONBOARDING_STAGE_ORDER.length;
	const progress = stepIndex >= 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0;

	return (
		<div className="min-h-dvh bg-canvas">
			<header className="flex items-center justify-between px-4 h-12 border-b border-neutral-200 bg-surface">
				{backHref ? (
					<Link href={backHref} className="p-2 -ml-2" aria-label="戻る">
						<ArrowLeft className="h-5 w-5" />
					</Link>
				) : (
					<span className="w-9" />
				)}
				<h1 className="text-sm font-medium">セットアップ</h1>
				<span className="text-xs text-neutral-500 w-9 text-right">
					{stepIndex >= 0 ? `${stepIndex + 1}/${totalSteps}` : ""}
				</span>
			</header>
			{stage !== "blocked" && (
				<Progress value={progress} className="h-1 rounded-none" />
			)}
			<main className="max-w-lg mx-auto px-4 py-6 pb-24">{children}</main>
		</div>
	);
}

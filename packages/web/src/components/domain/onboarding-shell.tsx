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
		<div className="min-h-dvh bg-bg-canvas">
			<header className="sticky top-0 z-20 border-b border-neutral-200 bg-bg-surface/95 backdrop-blur supports-backdrop-filter:bg-bg-surface/80">
				<div className="flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
					{backHref ? (
						<Link
							href={backHref}
							className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100"
							aria-label="戻る"
						>
							<ArrowLeft className="h-5 w-5" />
						</Link>
					) : (
						<span className="w-9" aria-hidden />
					)}
					<h1 className="text-sm font-semibold tracking-tight text-neutral-900 sm:text-base">
						セットアップ
					</h1>
					<span className="w-9 text-right text-caption tabular text-neutral-500">
						{stepIndex >= 0 ? `${stepIndex + 1}/${totalSteps}` : ""}
					</span>
				</div>
				{stage !== "blocked" && (
					<Progress
						value={progress}
						className="h-1 rounded-none bg-neutral-100"
						aria-label={`セットアップ進捗 ${stepIndex + 1}/${totalSteps}`}
					/>
				)}
			</header>
			<main className="mx-auto w-full max-w-lg px-4 py-6 pb-24 sm:px-6 sm:py-8 lg:max-w-2xl">
				{children}
			</main>
		</div>
	);
}

"use client";

import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

import { PlanErrorBanner } from "./plan-error-banner";
import { PlanLoadingState } from "./plan-loading-state";

export function PlanEmptyState({
	onGenerate,
	isPending,
	isError,
}: {
	onGenerate: () => void;
	isPending: boolean;
	isError: boolean;
}) {
	if (isPending) return <PlanLoadingState />;
	if (isError)
		return <PlanErrorBanner onRetry={onGenerate} isPending={isPending} />;
	return (
		<Card>
			<CardHeader>
				<CardTitle>今週のプランがまだありません</CardTitle>
				<CardDescription>
					あなたに合わせた 7 日間プランを作成します。
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button onClick={onGenerate} disabled={isPending}>
					プランを作成する
				</Button>
			</CardContent>
		</Card>
	);
}

"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CoachPromptCardProps = {
	prompt: string | null;
	isLoading: boolean;
	isFallback?: boolean;
	isUnavailable?: boolean;
};

export function CoachPromptCard({
	prompt,
	isLoading,
	isFallback = false,
	isUnavailable = false,
}: CoachPromptCardProps) {
	return (
		<Card className="mb-6 border-primary-100 bg-bg-subtle">
			<CardContent className="pt-6">
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : isUnavailable || prompt === null ? (
					<div className="space-y-2">
						<p className="text-body leading-relaxed text-danger-700">
							コーチメッセージを取得できませんでした。
						</p>
						<p className="text-caption text-neutral-600">
							再読み込みするか、このまま入力を続けてください。
						</p>
					</div>
				) : (
					<div className="space-y-2">
						{isFallback ? (
							<p className="text-caption text-neutral-600">
								AI 生成が利用できなかったため、固定メッセージを表示しています。
							</p>
						) : null}
						<p className="whitespace-pre-wrap text-body leading-relaxed text-neutral-900">
							{prompt}
						</p>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

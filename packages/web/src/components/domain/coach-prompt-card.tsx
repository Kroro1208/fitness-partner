"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type CoachPromptCardProps = {
	prompt: string | null;
	isLoading: boolean;
};

const FALLBACK =
	"ここではあなたのことをもう少し教えてください。入力内容に合わせて最適な提案ができるよう準備します。";

export function CoachPromptCard({ prompt, isLoading }: CoachPromptCardProps) {
	return (
		<Card className="mb-6 bg-subtle border-primary-100">
			<CardContent className="pt-6">
				{isLoading ? (
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</div>
				) : (
					<p className="text-sm leading-relaxed text-neutral-900 whitespace-pre-wrap">
						{prompt ?? FALLBACK}
					</p>
				)}
			</CardContent>
		</Card>
	);
}

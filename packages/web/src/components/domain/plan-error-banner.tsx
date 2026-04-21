"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function PlanErrorBanner({
	onRetry,
	isPending = false,
}: {
	onRetry: () => void;
	isPending?: boolean;
}) {
	return (
		<Alert variant="destructive">
			<AlertTitle>プラン生成に失敗しました</AlertTitle>
			<AlertDescription>時間をおいて再度お試しください。</AlertDescription>
			<Button
				variant="outline"
				className="mt-2"
				onClick={onRetry}
				disabled={isPending}
			>
				{isPending ? "再生成中..." : "再試行する"}
			</Button>
		</Alert>
	);
}

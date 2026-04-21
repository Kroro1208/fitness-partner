import { Skeleton } from "@/components/ui/skeleton";

export function PlanLoadingState({ message }: { message?: string }) {
	return (
		<div className="space-y-3" aria-busy="true" aria-live="polite">
			<p className="text-sm text-neutral-600">
				{message ?? "あなた専用のプランを作成しています…"}
			</p>
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-24 w-full" />
			<Skeleton className="h-48 w-full" />
		</div>
	);
}

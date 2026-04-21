import { Skeleton } from "@/components/ui/skeleton";

export default function OnboardingLoading() {
	return (
		<div className="min-h-dvh bg-canvas">
			<header className="flex h-12 items-center justify-between border-b border-neutral-200 bg-surface px-4">
				<div className="w-9" />
				<div className="text-sm font-medium">セットアップ</div>
				<Skeleton className="h-4 w-10 bg-neutral-200" />
			</header>
			<div className="h-1 w-full bg-neutral-200" />
			<main className="mx-auto max-w-lg space-y-6 px-4 py-6 pb-24">
				<div className="space-y-3">
					<Skeleton className="h-5 w-40 bg-neutral-200" />
					<Skeleton className="h-4 w-full bg-neutral-100" />
					<Skeleton className="h-4 w-3/4 bg-neutral-100" />
				</div>

				<div className="space-y-2">
					<Skeleton className="h-4 w-24 bg-neutral-200" />
					<Skeleton className="h-11 w-full rounded-[var(--radius-md)] bg-neutral-100" />
				</div>

				<div className="space-y-2">
					<Skeleton className="h-4 w-28 bg-neutral-200" />
					<div className="flex gap-2">
						<Skeleton className="h-11 flex-1 rounded-[var(--radius-md)] bg-neutral-100" />
						<Skeleton className="h-11 flex-1 rounded-[var(--radius-md)] bg-neutral-100" />
					</div>
				</div>

				<div className="space-y-2">
					<Skeleton className="h-4 w-20 bg-neutral-200" />
					<Skeleton className="h-11 w-full rounded-[var(--radius-md)] bg-neutral-100" />
				</div>

				<div className="flex justify-end">
					<Skeleton className="h-11 w-28 rounded-[var(--radius-md)] bg-neutral-200" />
				</div>
			</main>
		</div>
	);
}

import { Loader2 } from "lucide-react";

export default function RootLoading() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-bg-canvas">
			<div
				role="status"
				aria-label="読み込み中"
				className="flex flex-col items-center gap-3 text-neutral-600"
			>
				<Loader2
					className="h-6 w-6 animate-spin text-primary-500"
					aria-hidden
				/>
				<span className="text-caption">読み込み中...</span>
			</div>
		</div>
	);
}

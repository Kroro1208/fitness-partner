"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function RootError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	useEffect(() => {
		console.error(error);
	}, [error]);

	return (
		<div className="flex min-h-dvh items-center justify-center bg-bg-canvas px-4">
			<div className="max-w-md space-y-4 text-center">
				<div
					aria-hidden
					className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger-100 text-danger-700"
				>
					<AlertTriangle className="h-6 w-6" />
				</div>
				<h1 className="text-display font-semibold tracking-tight text-neutral-900">
					問題が発生しました
				</h1>
				<p className="text-body text-neutral-600">
					再試行するか、しばらく待ってからもう一度開いてください。
				</p>
				<Button onClick={() => reset()}>再試行</Button>
			</div>
		</div>
	);
}

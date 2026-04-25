import { Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
	return (
		<div className="flex min-h-dvh items-center justify-center bg-bg-canvas px-4">
			<div className="max-w-md space-y-4 text-center">
				<div
					aria-hidden
					className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-600"
				>
					<Compass className="h-6 w-6" />
				</div>
				<h1 className="text-display font-semibold tracking-tight text-neutral-900">
					ページが見つかりません
				</h1>
				<p className="text-body text-neutral-600">
					URL が変更されたか、削除された可能性があります。
				</p>
				<Button asChild>
					<Link href="/home">ホームへ戻る</Link>
				</Button>
			</div>
		</div>
	);
}

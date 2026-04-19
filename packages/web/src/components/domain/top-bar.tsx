"use client";

import { LogOut, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function TopBar() {
	const { signOut, isSigningOut } = useAuth();

	return (
		<header className="sticky top-0 z-20 w-full border-b border-neutral-200 bg-bg-surface/90 backdrop-blur supports-backdrop-filter:bg-bg-surface/75">
			<div className="flex h-14 w-full items-center justify-between px-4 sm:px-6">
				<div className="flex items-center gap-2">
					<span
						aria-hidden
						className="flex size-8 items-center justify-center rounded-full bg-primary-100 text-primary-600"
					>
						<Sparkles className="size-4" />
					</span>
					<span className="text-[15px] font-semibold tracking-tight text-neutral-900">
						AI Fitness Partner
					</span>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => signOut()}
					disabled={isSigningOut}
					aria-label="ログアウト"
					className="gap-1.5 text-neutral-700"
				>
					<LogOut className="size-4" aria-hidden />
					<span className="hidden sm:inline">
						{isSigningOut ? "ログアウト中..." : "ログアウト"}
					</span>
				</Button>
			</div>
		</header>
	);
}

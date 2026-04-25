"use client";

import {
	CalendarDays,
	Home,
	type LucideIcon,
	MessageCircle,
	TrendingUp,
	User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
	{ href: "/home", label: "ホーム", Icon: Home },
	{ href: "/plan", label: "プラン", Icon: CalendarDays },
	{ href: "/chat", label: "チャット", Icon: MessageCircle },
	{ href: "/progress", label: "進捗", Icon: TrendingUp },
	{ href: "/profile", label: "プロフィール", Icon: User },
] satisfies readonly {
	href: string;
	label: string;
	Icon: LucideIcon;
}[];

export function BottomTabBar() {
	const pathname = usePathname();

	return (
		<nav
			aria-label="メインナビゲーション"
			className="fixed right-0 bottom-0 left-0 z-20 border-t border-neutral-200 bg-bg-surface/95 pb-safe backdrop-blur supports-backdrop-filter:bg-bg-surface/80"
		>
			<ul className="mx-auto flex w-full max-w-lg items-stretch px-2 sm:px-4 lg:max-w-2xl">
				{TABS.map(({ href, label, Icon }) => {
					const isActive = pathname === href || pathname.startsWith(`${href}/`);
					return (
						<li key={href} className="flex-1">
							<Link
								href={href}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors",
									isActive
										? "text-primary-600"
										: "text-neutral-500 hover:text-neutral-700",
								)}
							>
								<Icon
									className={cn(
										"h-5 w-5 transition-transform",
										isActive ? "stroke-[2.25] scale-110" : "stroke-[1.75]",
									)}
									aria-hidden
								/>
								<span
									className={cn(
										isActive ? "font-semibold" : "font-medium",
										"leading-none",
									)}
								>
									{label}
								</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

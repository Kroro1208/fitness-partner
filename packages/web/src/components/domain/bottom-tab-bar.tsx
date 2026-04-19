"use client";

import {
	CalendarDays,
	Home,
	MessageCircle,
	TrendingUp,
	User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
	{ href: "/home", label: "Home", Icon: Home },
	{ href: "/plan", label: "Plan", Icon: CalendarDays },
	{ href: "/chat", label: "Chat", Icon: MessageCircle },
	{ href: "/progress", label: "Progress", Icon: TrendingUp },
	{ href: "/profile", label: "Profile", Icon: User },
] as const;

export function BottomTabBar() {
	const pathname = usePathname();

	return (
		<nav
			aria-label="Primary"
			className="sticky bottom-0 z-10 w-full border-t border-neutral-200 bg-bg-surface pb-safe"
		>
			<ul className="flex w-full items-stretch">
				{TABS.map(({ href, label, Icon }) => {
					const isActive = pathname === href || pathname.startsWith(`${href}/`);
					return (
						<li key={href} className="flex-1">
							<Link
								href={href}
								aria-current={isActive ? "page" : undefined}
								className={cn(
									"flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors",
									isActive
										? "text-primary-600"
										: "text-neutral-500 hover:text-neutral-700",
								)}
							>
								<Icon
									className={cn(
										"h-5 w-5",
										isActive ? "stroke-[2.25]" : "stroke-[1.75]",
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

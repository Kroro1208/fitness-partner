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
			className="sticky bottom-0 bg-bg-surface border-t border-neutral-200 pb-safe z-10"
		>
			<ul className="flex items-stretch justify-around">
				{TABS.map(({ href, label, Icon }) => {
					const isActive = pathname === href || pathname.startsWith(`${href}/`);
					return (
						<li key={href} className="flex-1">
							<Link
								href={href}
								className={cn(
									"flex min-h-[44px] flex-col items-center justify-center gap-0.5 py-2 text-xs",
									isActive
										? "text-primary-500"
										: "text-neutral-500 hover:text-neutral-700",
								)}
								aria-current={isActive ? "page" : undefined}
							>
								<Icon className="h-5 w-5" aria-hidden />
								<span>{label}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

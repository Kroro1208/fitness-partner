import { BottomTabBar } from "./bottom-tab-bar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-dvh flex flex-col bg-bg-canvas max-w-lg mx-auto">
			<TopBar />
			<main className="flex-1 overflow-y-auto px-4 pb-20 pt-4">{children}</main>
			<BottomTabBar />
		</div>
	);
}

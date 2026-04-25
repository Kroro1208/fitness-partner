import { BottomTabBar } from "./bottom-tab-bar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-dvh bg-bg-canvas">
			<TopBar />
			<main>
				<div className="mx-auto w-full max-w-lg px-4 pt-4 pb-safe-lg sm:px-6 sm:pt-6 lg:max-w-2xl">
					{children}
				</div>
			</main>
			<BottomTabBar />
		</div>
	);
}

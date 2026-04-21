import { BottomTabBar } from "./bottom-tab-bar";
import { TopBar } from "./top-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-dvh flex-col bg-bg-canvas">
			<TopBar />
			<main className="flex-1 overflow-y-auto">
				<div className="mx-auto w-full max-w-lg px-4 pt-4 pb-24">
					{children}
				</div>
			</main>
			<BottomTabBar />
		</div>
	);
}

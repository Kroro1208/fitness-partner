import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(""),
	useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

const mockUseWeeklyPlan = vi.fn();
const mockUseGeneratePlan = vi.fn(() => ({
	mutate: vi.fn(),
	isPending: false,
	isError: false,
}));
vi.mock("@/hooks/use-plan", () => ({
	useWeeklyPlan: (...args: unknown[]) => mockUseWeeklyPlan(...args),
	useGeneratePlan: () => mockUseGeneratePlan(),
}));

import { HomeContent } from "./home-content";

const wrapper = ({ children }: { children: ReactNode }) => (
	<QueryClientProvider client={new QueryClient()}>
		{children}
	</QueryClientProvider>
);

beforeEach(() => {
	mockUseWeeklyPlan.mockReset();
	mockUseGeneratePlan.mockReset();
	mockUseGeneratePlan.mockReturnValue({
		mutate: vi.fn(),
		isPending: false,
		isError: false,
	});
	replaceMock.mockReset();
});

afterEach(() => {
	cleanup();
});

describe("HomeContent", () => {
	it("plan なし → PlanEmptyState", () => {
		mockUseWeeklyPlan.mockReturnValue({
			data: null,
			isLoading: false,
			isError: false,
		});
		render(<HomeContent weekStart="2026-04-20" initialPlan={null} />, {
			wrapper,
		});
		expect(screen.getByText(/プランがまだありません/)).toBeInTheDocument();
	});

	it("loading → skeleton", () => {
		mockUseWeeklyPlan.mockReturnValue({
			data: undefined,
			isLoading: true,
			isError: false,
		});
		render(<HomeContent weekStart="2026-04-20" initialPlan={null} />, {
			wrapper,
		});
		expect(screen.getByText(/作成しています/)).toBeInTheDocument();
	});

	it("error → PlanErrorBanner", () => {
		mockUseWeeklyPlan.mockReturnValue({
			data: undefined,
			isLoading: false,
			isError: true,
		});
		render(<HomeContent weekStart="2026-04-20" initialPlan={null} />, {
			wrapper,
		});
		expect(screen.getByText(/再試行する/)).toBeInTheDocument();
	});

	it("plan がある read error は last-known-good を維持しつつ banner を出す", () => {
		const plan = {
			planId: "p1",
			weekStart: "2026-04-20",
			generatedAt: "2026-04-20T00:00:00Z",
			targetCaloriesKcal: 2000,
			targetProteinG: 120,
			targetFatG: 60,
			targetCarbsG: 200,
			days: [
				{
					date: "2026-04-20",
					theme: "テスト",
					meals: [],
					dailyTotalCaloriesKcal: 1500,
					dailyTotalProteinG: 90,
					dailyTotalFatG: 50,
					dailyTotalCarbsG: 150,
				},
			],
		};
		mockUseWeeklyPlan.mockReturnValue({
			data: plan,
			isLoading: false,
			isError: true,
		});
		render(<HomeContent weekStart="2026-04-20" />, {
			wrapper,
		});
		expect(screen.getByText(/1 日の目標/)).toBeInTheDocument();
		expect(screen.getByText(/再試行する/)).toBeInTheDocument();
	});

	it("plan あり → Macro + DailySummary が表示", () => {
		const plan = {
			planId: "p1",
			weekStart: "2026-04-20",
			generatedAt: "2026-04-20T00:00:00Z",
			targetCaloriesKcal: 2000,
			targetProteinG: 120,
			targetFatG: 60,
			targetCarbsG: 200,
			days: [
				{
					date: "2026-04-20",
					theme: "テスト",
					meals: [],
					dailyTotalCaloriesKcal: 1500,
					dailyTotalProteinG: 90,
					dailyTotalFatG: 50,
					dailyTotalCarbsG: 150,
				},
			],
		};
		mockUseWeeklyPlan.mockReturnValue({
			data: plan,
			isLoading: false,
			isError: false,
		});
		render(<HomeContent weekStart="2026-04-20" initialPlan={null} />, {
			wrapper,
		});
		expect(screen.getByText(/1 日の目標/)).toBeInTheDocument();
		expect(screen.getByText(/今日のサマリー/)).toBeInTheDocument();
	});

	it("generate.isPending 中は再生成中表示に切り替わる", () => {
		mockUseWeeklyPlan.mockReturnValue({
			data: null,
			isLoading: false,
			isError: false,
		});
		mockUseGeneratePlan.mockReturnValueOnce({
			mutate: vi.fn(),
			isPending: true,
			isError: false,
		});
		render(<HomeContent weekStart="2026-04-20" initialPlan={null} />, {
			wrapper,
		});
		expect(screen.getByText(/再生成中/)).toBeInTheDocument();
	});
});

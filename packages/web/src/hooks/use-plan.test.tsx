import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/plans", () => ({
	generatePlanDto: vi.fn(async () => ({
		plan_id: "p1",
		week_start: "2026-04-20",
		generated_at: "2026-04-20T00:00:00Z",
		weekly_plan: {
			plan_id: "p1",
			week_start: "2026-04-20",
			generated_at: "2026-04-20T00:00:00Z",
			target_calories_kcal: 2000,
			target_protein_g: 120,
			target_fat_g: 60,
			target_carbs_g: 200,
			days: [],
			weekly_notes: [],
			snack_swaps: [],
			hydration_target_liters: 2.5,
			hydration_breakdown: [],
			supplement_recommendations: [],
			personal_rules: ["a", "b", "c"],
			timeline_notes: [],
		},
	})),
	fetchWeeklyPlanDto: vi.fn(async () => null),
}));

import { useGeneratePlan, useWeeklyPlan } from "./use-plan";

const wrapper =
	(qc: QueryClient) =>
	({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={qc}>{children}</QueryClientProvider>
	);

describe("useGeneratePlan + useWeeklyPlan", () => {
	it("mutation 後 useWeeklyPlan が VM を即返す", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { result: gen } = renderHook(() => useGeneratePlan(), {
			wrapper: wrapper(qc),
		});
		await gen.current.mutateAsync({ weekStart: "2026-04-20" });
		const { result: read } = renderHook(() => useWeeklyPlan("2026-04-20"), {
			wrapper: wrapper(qc),
		});
		await waitFor(() => expect(read.current.data).not.toBeUndefined());
		expect(read.current.data).toMatchObject({
			planId: "p1",
			targetCaloriesKcal: 2000,
		});
	});

	it("404 → null", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const { result } = renderHook(() => useWeeklyPlan("2026-04-20"), {
			wrapper: wrapper(qc),
		});
		await waitFor(() => expect(result.current.isFetched).toBe(true));
		expect(result.current.data).toBeNull();
	});
});

import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";

import {
	parseWeeklyPlanToVM,
	type WeeklyPlanVM,
} from "@/lib/plan/plan-mappers";
import { planQueryKey } from "@/lib/plan/plan-query";

import { useSwapApply, useSwapCandidates } from "./use-meal-swap";

const WEEK_START = "2026-04-20";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function makeMeal(slot: "breakfast" | "lunch" | "dinner", title: string) {
	return {
		slot,
		title,
		items: [
			{
				food_id: null,
				name: `${title}の材料`,
				grams: 100,
				calories_kcal: 200,
				protein_g: 20,
				fat_g: 5,
				carbs_g: 15,
			},
		],
		total_calories_kcal: 200,
		total_protein_g: 20,
		total_fat_g: 5,
		total_carbs_g: 15,
		prep_tag: null,
		notes: null,
	};
}

function makeWeeklyPlanWire() {
	return {
		plan_id: "p1",
		week_start: WEEK_START,
		generated_at: "2026-04-23T00:00:00Z",
		revision: 0,
		target_calories_kcal: 2000,
		target_protein_g: 120,
		target_fat_g: 60,
		target_carbs_g: 200,
		days: Array.from({ length: 7 }, (_, index) => ({
			date: `2026-04-${String(20 + index).padStart(2, "0")}`,
			theme: `テスト${index + 1}`,
			meals: [
				makeMeal("breakfast", index === 0 ? "朝食A" : `朝食${index + 1}`),
				makeMeal("lunch", index === 0 ? "昼食A" : `昼食${index + 1}`),
				makeMeal("dinner", index === 0 ? "夕食A" : `夕食${index + 1}`),
			],
			daily_total_calories_kcal: 600,
			daily_total_protein_g: 60,
			daily_total_fat_g: 15,
			daily_total_carbs_g: 45,
		})),
		weekly_notes: [],
		snack_swaps: [],
		hydration_target_liters: 2.5,
		hydration_breakdown: [],
		supplement_recommendations: [],
		personal_rules: ["r1", "r2", "r3"],
		timeline_notes: [],
	};
}

function makeSwapCandidatesResponse() {
	return {
		proposal_id: "prop-1",
		proposal_expires_at: "2026-04-25T00:10:00Z",
		candidates: [
			makeMeal("breakfast", "候補A"),
			makeMeal("breakfast", "候補B"),
			makeMeal("breakfast", "候補C"),
		],
	};
}

function makeSwapApplyResponse() {
	return {
		plan_id: "p1",
		revision: 1,
		updated_day: {
			date: "2026-04-20",
			theme: "更新後",
			meals: [
				makeMeal("breakfast", "新しい朝"),
				makeMeal("lunch", "昼食A"),
				makeMeal("dinner", "夕食A"),
			],
			daily_total_calories_kcal: 600,
			daily_total_protein_g: 60,
			daily_total_fat_g: 15,
			daily_total_carbs_g: 45,
		},
	};
}

function HookHarness() {
	const candidates = useSwapCandidates();
	const apply = useSwapApply(WEEK_START);
	const planQuery = useQuery<WeeklyPlanVM | null>({
		queryKey: planQueryKey(WEEK_START),
		queryFn: async () => null,
		enabled: false,
	});
	const firstMeal = planQuery.data?.days[0]?.meals[0]?.title ?? "no meal";
	const revision = planQuery.data?.revision ?? "no revision";

	return (
		<div>
			<div>{firstMeal}</div>
			<div>revision:{revision}</div>
			<div>
				candidates:
				{candidates.data?.candidates
					.map((candidate) => candidate.title)
					.join(",") ?? "none"}
			</div>
			<button
				type="button"
				onClick={() =>
					candidates.mutate({
						weekStart: WEEK_START,
						date: "2026-04-20",
						slot: "breakfast",
					})
				}
			>
				load candidates
			</button>
			<button
				type="button"
				onClick={() => apply.mutate({ proposalId: "prop-1", chosenIndex: 0 })}
			>
				apply
			</button>
		</div>
	);
}

function renderHarness() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	queryClient.setQueryData(
		planQueryKey(WEEK_START),
		parseWeeklyPlanToVM(makeWeeklyPlanWire()),
	);
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return render(<HookHarness />, { wrapper });
}

let fetchSpy: MockInstance;

beforeEach(() => {
	fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
	cleanup();
	fetchSpy.mockRestore();
});

describe("use-meal-swap hooks", () => {
	it("候補生成 API の結果を camelCase VM として返す", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse(makeSwapCandidatesResponse()));

		renderHarness();
		fireEvent.click(screen.getByRole("button", { name: "load candidates" }));

		expect(
			await screen.findByText("candidates:候補A,候補B,候補C"),
		).toBeInTheDocument();
		expect(fetchSpy).toHaveBeenCalledWith(
			"/api/proxy/users/me/plans/2026-04-20/meals/swap-candidates",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("apply 成功で weekly plan cache の day と revision を更新する", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse(makeSwapApplyResponse()));

		renderHarness();
		expect(screen.getByText("朝食A")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "apply" }));

		expect(await screen.findByText("新しい朝")).toBeInTheDocument();
		expect(screen.getByText("revision:1")).toBeInTheDocument();
	});
});

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

import { parseWeeklyPlanToVM } from "@/lib/plan/plan-mappers";

let searchParams = new URLSearchParams("");
const replaceMock = vi.fn();

// next/navigation の router / search params は Next.js framework adapter であり、
// test 環境には存在しない。framework adapter として置換する (Khorikov 的にも
// "外部依存の境界" モックに該当)。replaceMock の呼び出しは「URL を更新する」
// 観察可能な副作用の発火検証として扱う (内部関数の呼び出し検証ではない)。
vi.mock("next/navigation", () => ({
	useSearchParams: () => searchParams,
	useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import { PlanContent } from "./plan-content";

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
		week_start: "2026-04-20",
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
				makeMeal("breakfast", `朝食${index + 1}`),
				makeMeal("lunch", `昼食${index + 1}`),
				makeMeal("dinner", `夕食${index + 1}`),
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

function renderPlanContent({
	initialPlan,
}: {
	initialPlan?: ReturnType<typeof parseWeeklyPlanToVM> | null;
} = {}) {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	return render(
		<PlanContent weekStart="2026-04-20" initialPlan={initialPlan} />,
		{ wrapper },
	);
}

let fetchSpy: MockInstance;

beforeEach(() => {
	searchParams = new URLSearchParams("");
	replaceMock.mockReset();
	fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
	cleanup();
	fetchSpy.mockRestore();
});

describe("PlanContent", () => {
	it("initial plan がある場合は cache から表示し、追加 fetch や generate を実行しない", () => {
		renderPlanContent({
			initialPlan: parseWeeklyPlanToVM(makeWeeklyPlanWire()),
		});

		expect(screen.getByText(/1 日の目標/)).toBeInTheDocument();
		expect(screen.getByRole("tab", { name: /4\/20/ })).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "プランを作成する" }),
		).toBeNull();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it("server fetch failure without initial plan shows error banner", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));

		renderPlanContent();

		expect(await screen.findByText(/再試行する/)).toBeInTheDocument();
		expect(screen.queryByText(/プランがまだありません/)).toBeNull();
	});

	it("query string の day が plan 内の日付ならその日を表示する", () => {
		searchParams = new URLSearchParams("day=2026-04-22");

		renderPlanContent({
			initialPlan: parseWeeklyPlanToVM(makeWeeklyPlanWire()),
		});

		expect(screen.getByText("テスト3")).toBeInTheDocument();
		expect(screen.getByText("朝食3")).toBeInTheDocument();
	});

	it("day tab click で URL query 更新の副作用を発火する", () => {
		renderPlanContent({
			initialPlan: parseWeeklyPlanToVM(makeWeeklyPlanWire()),
		});

		fireEvent.click(screen.getByRole("tab", { name: /4\/22/ }));

		// 副作用: URL 更新 (Next.js router 経由)。
		// 本物の router では replace が URL を更新し useSearchParams() も追従するが、
		// test 環境のモックは static なので tab の aria-selected 同期は起きない。
		// 単選択 tab の選択状態同期は別の test (query string が plan 内の日付なら...)
		// で初期 render 時に検証している。
		expect(replaceMock).toHaveBeenCalledWith("/plan?day=2026-04-22");
	});
});

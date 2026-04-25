import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
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
import { planQueryKey } from "@/lib/plan/plan-query";

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams(""),
	useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

import { HomeContent } from "./home-content";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function deferredResponse() {
	let resolve!: (value: Response) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<Response>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
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

function makeWeeklyPlanWire(overrides: Record<string, unknown> = {}) {
	const baseBreakfast = makeMeal("breakfast", "朝食A");
	const baseLunch = makeMeal("lunch", "昼食A");
	const baseDinner = makeMeal("dinner", "夕食A");
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
				{ ...baseBreakfast, title: index === 0 ? "朝食A" : `朝食${index + 1}` },
				{ ...baseLunch, title: index === 0 ? "昼食A" : `昼食${index + 1}` },
				{ ...baseDinner, title: index === 0 ? "夕食A" : `夕食${index + 1}` },
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
		...overrides,
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

function renderHome({
	weekStart = "2026-04-20",
	initialPlan,
	seededPlan,
}: {
	weekStart?: string;
	initialPlan?: ReturnType<typeof parseWeeklyPlanToVM> | null;
	seededPlan?: ReturnType<typeof parseWeeklyPlanToVM> | null;
} = {}) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	if (seededPlan !== undefined) {
		qc.setQueryData(planQueryKey(weekStart), seededPlan, {
			updatedAt: 0,
		});
	}
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={qc}>{children}</QueryClientProvider>
	);
	return render(
		<HomeContent
			weekStart={weekStart}
			today="2026-04-20"
			initialPlan={initialPlan}
		/>,
		{
			wrapper,
		},
	);
}

let fetchSpy: MockInstance;

beforeEach(() => {
	fetchSpy = vi.spyOn(globalThis, "fetch");
	replaceMock.mockReset();
});

afterEach(() => {
	cleanup();
	fetchSpy.mockRestore();
});

describe("HomeContent", () => {
	it("plan なしなら empty state を表示する", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "not_found" }, 404));

		renderHome();

		expect(
			await screen.findByText(/プランがまだありません/),
		).toBeInTheDocument();
	});

	it("weekly plan 読み込み中は skeleton を表示する", async () => {
		const pending = deferredResponse();
		fetchSpy.mockReturnValueOnce(pending.promise);

		renderHome();

		expect(screen.getByText(/プランを作成しています/)).toBeInTheDocument();
		pending.resolve(jsonResponse({ error: "not_found" }, 404));
		await screen.findByText(/プランがまだありません/);
	});

	it("read error かつ plan 不在なら error banner を表示する", async () => {
		fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));

		renderHome();

		expect(await screen.findByText(/再試行する/)).toBeInTheDocument();
	});

	it("stale cache がある read error は last-known-good を維持する", async () => {
		const seededPlan = parseWeeklyPlanToVM(makeWeeklyPlanWire());
		fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));

		renderHome({ seededPlan });

		expect(screen.getByText(/1 日の目標/)).toBeInTheDocument();
		expect(await screen.findByText(/再試行する/)).toBeInTheDocument();
	});

	it("generate 成功で plan UI を表示する", async () => {
		fetchSpy
			.mockResolvedValueOnce(jsonResponse({ error: "not_found" }, 404))
			.mockResolvedValueOnce(
				jsonResponse({
					plan_id: "p1",
					week_start: "2026-04-20",
					generated_at: "2026-04-23T00:00:00Z",
					weekly_plan: makeWeeklyPlanWire(),
				}),
			);

		renderHome();

		fireEvent.click(
			await screen.findByRole("button", { name: "プランを作成する" }),
		);

		expect(await screen.findByText(/1 日の目標/)).toBeInTheDocument();
		expect(screen.getByText(/今日のサマリー/)).toBeInTheDocument();
	});

	it("meal swap apply 成功で画面の meal title が更新される", async () => {
		fetchSpy
			.mockResolvedValueOnce(jsonResponse({ plan: makeWeeklyPlanWire() }))
			.mockResolvedValueOnce(jsonResponse(makeSwapCandidatesResponse()))
			.mockResolvedValueOnce(jsonResponse(makeSwapApplyResponse()));

		renderHome();

		const swapButtons = await screen.findAllByRole("button", {
			name: "差し替え",
		});
		fireEvent.click(swapButtons[0]);
		expect(await screen.findByText("候補A")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "この食事に変更" }));

		await waitFor(() => {
			expect(screen.getByText("新しい朝")).toBeInTheDocument();
		});
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("候補生成中に modal を閉じると、遅れて返った response を反映しない", async () => {
		const pendingCandidates = deferredResponse();
		fetchSpy
			.mockResolvedValueOnce(jsonResponse({ plan: makeWeeklyPlanWire() }))
			.mockReturnValueOnce(pendingCandidates.promise);

		renderHome();

		const swapButtons = await screen.findAllByRole("button", {
			name: "差し替え",
		});
		fireEvent.click(swapButtons[0]);
		expect(await screen.findByRole("dialog")).toBeInTheDocument();
		expect(screen.getByRole("status")).toHaveTextContent(/候補を生成/);

		fireEvent.click(screen.getByRole("button", { name: "Close" }));
		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});

		pendingCandidates.resolve(jsonResponse(makeSwapCandidatesResponse()));

		await waitFor(() => {
			expect(screen.queryByRole("dialog")).toBeNull();
		});
		expect(
			screen.getAllByRole("button", { name: "差し替え" })[0],
		).toBeEnabled();
	});
});

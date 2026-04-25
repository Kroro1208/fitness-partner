import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";

import type { ApiError } from "@/lib/api-client";

import { generatePlan } from "./plans";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function makeWeeklyPlan() {
	const mealItem = {
		food_id: null,
		name: "鶏むね",
		grams: 150,
		calories_kcal: 180,
		protein_g: 33,
		fat_g: 3,
		carbs_g: 0,
	};
	const meal = {
		slot: "breakfast",
		title: "朝食",
		items: [mealItem],
		total_calories_kcal: 180,
		total_protein_g: 33,
		total_fat_g: 3,
		total_carbs_g: 0,
	};
	const day = {
		date: "2026-04-20",
		theme: "高タンパク",
		meals: [meal, { ...meal, slot: "lunch" }, { ...meal, slot: "dinner" }],
		daily_total_calories_kcal: 540,
		daily_total_protein_g: 99,
		daily_total_fat_g: 9,
		daily_total_carbs_g: 0,
	};
	return {
		plan_id: "p1",
		week_start: "2026-04-20",
		generated_at: "2026-04-23T00:00:00Z",
		revision: 0,
		target_calories_kcal: 2200,
		target_protein_g: 140,
		target_fat_g: 70,
		target_carbs_g: 240,
		days: Array.from({ length: 7 }, (_, i) => ({
			...day,
			date: `2026-04-${String(20 + i).padStart(2, "0")}`,
		})),
		weekly_notes: [],
		snack_swaps: [],
		hydration_target_liters: 2.5,
		hydration_breakdown: [],
		supplement_recommendations: [],
		personal_rules: ["a", "b", "c"],
		timeline_notes: [],
	};
}

let fetchSpy: MockInstance;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-04-23T00:00:00Z"));
	fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
	fetchSpy.mockRestore();
	vi.useRealTimers();
});

describe("generatePlan", () => {
	it.each([
		503, 504,
	])("%i の後に保存済み plan を polling で回収する", async (status) => {
		const weeklyPlan = makeWeeklyPlan();
		fetchSpy
			.mockResolvedValueOnce(
				jsonResponse({ error: "generation_timeout" }, status),
			)
			.mockResolvedValueOnce(jsonResponse({ error: "not_found" }, 404))
			.mockResolvedValueOnce(jsonResponse({ plan: weeklyPlan }));

		const promise = generatePlan({ weekStart: "2026-04-20" });
		await vi.advanceTimersByTimeAsync(2_000);
		await vi.advanceTimersByTimeAsync(2_000);
		const result = await promise;

		expect(result.planId).toBe("p1");
		expect(fetchSpy).toHaveBeenCalledTimes(3);
		expect(fetchSpy.mock.calls.map((call) => String(call[0]))).toEqual([
			"/api/proxy/users/me/plans/generate",
			"/api/proxy/users/me/plans/2026-04-20",
			"/api/proxy/users/me/plans/2026-04-20",
		]);
	});

	it("force regenerate の 504 は古い plan と混同せず失敗として返す", async () => {
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({ error: "generation_timeout" }, 504),
		);

		await expect(
			generatePlan({ weekStart: "2026-04-20", forceRegenerate: true }),
		).rejects.toMatchObject({
			status: 504,
		} satisfies Partial<ApiError>);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	it("weekly_plan に revision が無くても Zod が通り成功する", async () => {
		const weeklyPlan = makeWeeklyPlan();
		const { revision: _r, ...withoutRevision } = weeklyPlan;
		fetchSpy.mockResolvedValueOnce(
			jsonResponse({
				plan_id: "p1",
				week_start: "2026-04-20",
				generated_at: "2026-04-23T00:00:00Z",
				weekly_plan: withoutRevision,
			}),
		);

		const result = await generatePlan({ weekStart: "2026-04-20" });
		expect(result.planId).toBe("p1");
		expect(result.weeklyPlan.revision).toBe(0);
	});
});

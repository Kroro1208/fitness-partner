import {
	GeneratePlanRequestSchema,
	GeneratePlanResponseSchema,
	MealSwapApplyRequestSchema,
	MealSwapApplyResponseSchema,
	MealSwapCandidatesRequestSchema,
	MealSwapCandidatesResponseSchema,
} from "@fitness/contracts-ts";

import { ApiError, apiClient } from "@/lib/api-client";
import { WeeklyPlanEnvelopeSchema } from "@/lib/plan/envelope";
import {
	type DayPlanVM,
	type MealVM,
	parseDayPlanToVM,
	parseMealToVM,
	parseWeeklyPlanToVM,
	type WeeklyPlanVM,
} from "@/lib/plan/plan-mappers";

export interface GeneratePlanResult {
	planId: string;
	weekStart: string;
	generatedAt: string;
	weeklyPlan: WeeklyPlanVM;
}

export interface SwapCandidatesResult {
	proposalId: string;
	proposalExpiresAt: string;
	candidates: MealVM[];
}

export interface SwapApplyResult {
	updatedDay: DayPlanVM;
	planId: string;
	revision: number;
}

interface PollDependencies {
	nowMs: () => number;
	sleep: (ms: number) => Promise<void>;
}

const defaultPollDependencies: PollDependencies = {
	nowMs: () => Date.now(),
	sleep,
};

export async function generatePlan(input: {
	weekStart: string;
	forceRegenerate?: boolean;
}): Promise<GeneratePlanResult> {
	const body = GeneratePlanRequestSchema.parse({
		week_start: input.weekStart,
		force_regenerate: input.forceRegenerate ?? false,
	});
	try {
		return toGeneratePlanResult(
			await apiClient("users/me/plans/generate", GeneratePlanResponseSchema, {
				method: "POST",
				body: JSON.stringify(body),
			}),
		);
	} catch (err) {
		if (
			input.forceRegenerate === true ||
			!(err instanceof ApiError) ||
			!isRecoverableGenerationTimeoutStatus(err.status)
		) {
			throw err;
		}
		return pollGeneratedPlanAfterTimeout(input.weekStart, err);
	}
}

export async function fetchWeeklyPlan(
	weekStart: string,
): Promise<WeeklyPlanVM | null> {
	try {
		const env = await apiClient(
			`users/me/plans/${encodeURIComponent(weekStart)}`,
			WeeklyPlanEnvelopeSchema,
		);
		return parseWeeklyPlanToVM(env.plan);
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) return null;
		throw err;
	}
}

async function pollGeneratedPlanAfterTimeout(
	weekStart: string,
	originalError: ApiError,
	deps: PollDependencies = defaultPollDependencies,
): Promise<GeneratePlanResult> {
	const deadline = deps.nowMs() + 90_000;
	while (deps.nowMs() < deadline) {
		await deps.sleep(2_000);
		const plan = await fetchWeeklyPlan(weekStart);
		if (plan !== null) {
			return {
				planId: plan.planId,
				weekStart: plan.weekStart,
				generatedAt: plan.generatedAt,
				weeklyPlan: plan,
			};
		}
	}
	throw originalError;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecoverableGenerationTimeoutStatus(status: number): boolean {
	return status === 503 || status === 504;
}

// -----------------------------------------------------------------------
// Plan 09: Meal swap API (candidates / apply)
// -----------------------------------------------------------------------

export async function swapCandidates(input: {
	weekStart: string;
	date: string;
	slot: "breakfast" | "lunch" | "dinner" | "dessert";
}): Promise<SwapCandidatesResult> {
	const body = MealSwapCandidatesRequestSchema.parse({
		date: input.date,
		slot: input.slot,
	});
	const response = await apiClient(
		`users/me/plans/${encodeURIComponent(input.weekStart)}/meals/swap-candidates`,
		MealSwapCandidatesResponseSchema,
		{
			method: "POST",
			body: JSON.stringify(body),
		},
	);
	return {
		proposalId: response.proposal_id,
		proposalExpiresAt: response.proposal_expires_at,
		candidates: response.candidates.map(parseMealToVM),
	};
}

export async function swapApply(input: {
	weekStart: string;
	proposalId: string;
	chosenIndex: number;
}): Promise<SwapApplyResult> {
	const body = MealSwapApplyRequestSchema.parse({
		proposal_id: input.proposalId,
		chosen_index: input.chosenIndex,
	});
	const response = await apiClient(
		`users/me/plans/${encodeURIComponent(input.weekStart)}/meals/swap-apply`,
		MealSwapApplyResponseSchema,
		{
			method: "POST",
			body: JSON.stringify(body),
		},
	);
	return {
		updatedDay: parseDayPlanToVM(response.updated_day),
		planId: response.plan_id,
		revision: response.revision,
	};
}

function toGeneratePlanResult(response: {
	plan_id: string;
	week_start: string;
	generated_at: string;
	weekly_plan: unknown;
}): GeneratePlanResult {
	return {
		planId: response.plan_id,
		weekStart: response.week_start,
		generatedAt: response.generated_at,
		weeklyPlan: parseWeeklyPlanToVM(response.weekly_plan),
	};
}

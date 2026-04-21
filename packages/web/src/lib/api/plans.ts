import {
	GeneratePlanRequestSchema,
	GeneratePlanResponseSchema,
} from "@fitness/contracts-ts";

import { ApiError, apiClient } from "@/lib/api-client";
import { WeeklyPlanEnvelopeSchema } from "@/lib/plan/envelope";

export async function generatePlanDto(input: {
	weekStart: string;
	forceRegenerate?: boolean;
}) {
	const body = GeneratePlanRequestSchema.parse({
		week_start: input.weekStart,
		force_regenerate: input.forceRegenerate ?? false,
	});
	return apiClient("users/me/plans/generate", GeneratePlanResponseSchema, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function fetchWeeklyPlanDto(weekStart: string) {
	try {
		const env = await apiClient(
			`users/me/plans/${encodeURIComponent(weekStart)}`,
			WeeklyPlanEnvelopeSchema,
		);
		return env.plan;
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) return null;
		throw err;
	}
}

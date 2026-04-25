import type { DayPlan, Meal, WeeklyPlan } from "@fitness/contracts-ts";
import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import {
	completeProfileItem,
	makeGeneratedPlan,
} from "../generate-plan/fixtures";
import { makeEvent } from "../helpers/api-event";

export const TEST_USER_ID = "u1";
export const TEST_WEEK_START = "2026-04-20";

export { completeProfileItem };

const _baseItem = {
	food_id: null,
	name: "鶏むね",
	grams: 150,
	calories_kcal: 180,
	protein_g: 33,
	fat_g: 3,
	carbs_g: 0,
} as const;

export function buildMeal(
	slot: Meal["slot"],
	title: string,
	overrides: Partial<Meal> = {},
): Meal {
	return {
		slot,
		title,
		items: [{ ..._baseItem }],
		total_calories_kcal: 180,
		total_protein_g: 33,
		total_fat_g: 3,
		total_carbs_g: 0,
		prep_tag: null,
		notes: null,
		...overrides,
	};
}

export function buildDay(
	date: string,
	overrides: Partial<DayPlan> = {},
): DayPlan {
	return {
		date,
		theme: "test",
		meals: [
			buildMeal("breakfast", "朝"),
			buildMeal("lunch", "昼"),
			buildMeal("dinner", "夕"),
		],
		daily_total_calories_kcal: 540,
		daily_total_protein_g: 99,
		daily_total_fat_g: 9,
		daily_total_carbs_g: 0,
		...overrides,
	};
}

export function buildPlan(
	revision = 0,
	overrides: Partial<WeeklyPlan> = {},
): WeeklyPlan {
	const gen = makeGeneratedPlan();
	return {
		...gen,
		plan_id: "pid-test-1",
		week_start: TEST_WEEK_START,
		generated_at: "2026-04-19T00:00:00Z",
		revision,
		...overrides,
	} as WeeklyPlan;
}

export function buildPersistedPlanRow(
	revision = 0,
	overrides: Partial<WeeklyPlan> = {},
) {
	return {
		pk: `user#${TEST_USER_ID}`,
		sk: `plan#${TEST_WEEK_START}`,
		...buildPlan(revision, overrides),
		updated_at: "2026-04-19T00:00:00Z",
	};
}

/** candidates 経路の event: POST /users/me/plans/{weekStart}/meals/swap-candidates */
export function makeCandidatesEvent(
	body: unknown = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
	return makeEvent({
		method: "POST",
		path: `/users/me/plans/${TEST_WEEK_START}/meals/swap-candidates`,
		pathParameters: { weekStart: TEST_WEEK_START },
		sub: TEST_USER_ID,
		body: JSON.stringify(body),
	});
}

/** apply 経路の event: POST /users/me/plans/{weekStart}/meals/swap-apply */
export function makeApplyEvent(
	body: unknown = {},
): APIGatewayProxyEventV2WithJWTAuthorizer {
	return makeEvent({
		method: "POST",
		path: `/users/me/plans/${TEST_WEEK_START}/meals/swap-apply`,
		pathParameters: { weekStart: TEST_WEEK_START },
		sub: TEST_USER_ID,
		body: JSON.stringify(body),
	});
}

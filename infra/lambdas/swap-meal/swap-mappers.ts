import type {
	DailyMacroContext,
	DayPlan,
	Meal,
	WeeklyPlan,
} from "@fitness/contracts-ts";

// Meal.slot Literal 型を再利用。契約で MealSlot を export していないため。
type MealSlot = Meal["slot"];

export interface SwapTarget {
	day: DayPlan;
	meal: Meal;
}

export interface UpdatedPlanForSwap {
	updatedDay: DayPlan;
	updatedPlan: WeeklyPlan;
}

/**
 * target 日 / slot から DailyMacroContext を算出する純粋関数。
 *
 * original_day_total_* は target 日の daily_total_* をそのまま使う
 * (plan.target_* / 7 の均等割りは使わない。alcohol day / treat day を壊すため)。
 * other_meals_total_* は target slot 以外の meal.total_* 合計。
 */
export function buildDailyMacroContext(
	plan: WeeklyPlan,
	date: string,
	slot: MealSlot,
): DailyMacroContext {
	const day = plan.days.find((candidate) => candidate.date === date);
	if (!day) {
		throw new Error(`date not found: ${date}`);
	}
	if (!day.meals.some((candidate) => candidate.slot === slot)) {
		throw new Error(`slot not found: ${slot} in ${date}`);
	}
	const others = day.meals.filter((m) => m.slot !== slot);
	const sumInt = (pick: (m: Meal) => number): number =>
		others.reduce((acc, m) => acc + pick(m), 0);
	const sumFloat = (pick: (m: Meal) => number): number =>
		others.reduce((acc, m) => acc + pick(m), 0);

	return {
		date,
		original_day_total_calories_kcal: day.daily_total_calories_kcal,
		original_day_total_protein_g: day.daily_total_protein_g,
		original_day_total_fat_g: day.daily_total_fat_g,
		original_day_total_carbs_g: day.daily_total_carbs_g,
		other_meals_total_calories_kcal: sumInt((m) => m.total_calories_kcal),
		other_meals_total_protein_g: sumFloat((m) => m.total_protein_g),
		other_meals_total_fat_g: sumFloat((m) => m.total_fat_g),
		other_meals_total_carbs_g: sumFloat((m) => m.total_carbs_g),
	};
}

export function findSwapTarget(
	plan: WeeklyPlan,
	date: string,
	slot: MealSlot,
): SwapTarget | null {
	const day = plan.days.find((candidate) => candidate.date === date);
	if (!day) return null;

	const meal = day.meals.find((candidate) => candidate.slot === slot);
	if (!meal) return null;

	return { day, meal };
}

export function areSwapCandidatesValid(
	candidates: Meal[],
	slot: MealSlot,
): boolean {
	return candidates.every((candidate) => candidate.slot === slot);
}

export function pickSwapCandidate(
	candidates: Meal[],
	chosenIndex: number,
): Meal | null {
	return candidates[chosenIndex] ?? null;
}

export function isProposalExpired(
	ttlEpochSeconds: number,
	nowEpochSeconds: number,
): boolean {
	return ttlEpochSeconds <= nowEpochSeconds;
}

export function isPlanStaleForProposal(
	plan: WeeklyPlan,
	proposal: { current_plan_id: string; expected_revision: number },
): boolean {
	return (
		plan.plan_id !== proposal.current_plan_id ||
		plan.revision !== proposal.expected_revision
	);
}

/** day.meals の total_* を合算して daily_total_* を更新した新 day を返す。入力は mutate しない。 */
export function recalcDailyTotals(day: DayPlan): DayPlan {
	const sum = (pick: (m: Meal) => number): number =>
		day.meals.reduce((acc, m) => acc + pick(m), 0);
	return {
		...day,
		daily_total_calories_kcal: sum((m) => m.total_calories_kcal),
		daily_total_protein_g: sum((m) => m.total_protein_g),
		daily_total_fat_g: sum((m) => m.total_fat_g),
		daily_total_carbs_g: sum((m) => m.total_carbs_g),
	};
}

/** slot 一致 meal を chosen で置換し、daily_total_* を再計算した新 day を返す。 */
export function replaceMealInDay(
	day: DayPlan,
	slot: MealSlot,
	chosen: Meal,
): DayPlan {
	return recalcDailyTotals({
		...day,
		meals: day.meals.map((m) => (m.slot === slot ? chosen : m)),
	});
}

export function buildUpdatedPlanForSwap(
	plan: WeeklyPlan,
	date: string,
	slot: MealSlot,
	chosen: Meal,
): UpdatedPlanForSwap | null {
	const targetDayIdx = plan.days.findIndex((day) => day.date === date);
	if (targetDayIdx < 0) return null;

	const updatedDay = replaceMealInDay(plan.days[targetDayIdx], slot, chosen);
	return {
		updatedDay,
		updatedPlan: {
			...plan,
			days: plan.days.map((day, index) =>
				index === targetDayIdx ? updatedDay : day,
			),
			revision: plan.revision + 1,
		},
	};
}

export function toEpochSeconds(now: Date): number {
	return Math.floor(now.getTime() / 1000);
}

export function toIsoStringFromEpochSeconds(epochSeconds: number): string {
	return new Date(epochSeconds * 1000).toISOString();
}

export interface BuildProposalInput {
	userId: string;
	proposalId: string;
	weekStart: string;
	date: string;
	slot: MealSlot;
	plan: WeeklyPlan;
	candidates: Meal[];
	nowEpochSeconds: number;
}

export interface ProposalItem {
	pk: string;
	sk: string;
	week_start: string;
	date: string;
	slot: MealSlot;
	current_plan_id: string;
	expected_revision: number;
	candidates: Meal[];
	created_at: string;
	ttl: number;
}

/** swap proposal の DDB item を組み立てる (TTL 10 分、revision 比較用の 2 token を保持)。 */
export function buildProposalItem(input: BuildProposalInput): ProposalItem {
	const ttlSeconds = 600;
	return {
		pk: `user#${input.userId}`,
		sk: `swap_proposal#${input.proposalId}`,
		week_start: input.weekStart,
		date: input.date,
		slot: input.slot,
		current_plan_id: input.plan.plan_id,
		expected_revision: input.plan.revision,
		candidates: input.candidates,
		created_at: new Date(input.nowEpochSeconds * 1000).toISOString(),
		ttl: input.nowEpochSeconds + ttlSeconds,
	};
}

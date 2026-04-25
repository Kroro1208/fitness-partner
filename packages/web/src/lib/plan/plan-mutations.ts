import type { DayPlanVM, WeeklyPlanVM } from "./plan-mappers";

/**
 * Plan 09: swap-apply 成功時に、TanStack Query cache の WeeklyPlanVM を
 * 新しい day + revision で immutable に更新するための純粋関数。
 *
 * - updatedDay.date が plan に存在しなければ plan をそのまま返す (防御的)
 * - 入力 plan は mutate しない (spread + map で新オブジェクト生成)
 * - revision は server から返った新値を必ず使う (+1 計算は server 責務)
 */
export function replaceDayInPlan(
	plan: WeeklyPlanVM,
	updatedDay: DayPlanVM,
	revision: number,
): WeeklyPlanVM {
	const idx = plan.days.findIndex((d) => d.date === updatedDay.date);
	if (idx < 0) return plan;
	return {
		...plan,
		days: plan.days.map((d, i) => (i === idx ? updatedDay : d)),
		revision,
	};
}

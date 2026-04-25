"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { DayPlanVM } from "@/lib/plan/plan-mappers";

import { MealCard } from "./meal-card";

type MealSlot = DayPlanVM["meals"][number]["slot"];

export interface DailyDetailProps {
	day: DayPlanVM;
	/** swap 起動 callback。未指定なら各 meal に差し替えボタンを出さない。 */
	onSwap?: (slot: MealSlot) => void;
	/** swap pending 中の slot。該当 meal の差し替えボタンを disabled にする。 */
	pendingSlot?: MealSlot | null;
	/** modal open 中など、他 meal の swap 起動を止める。 */
	swapDisabled?: boolean;
}

export function DailyDetail({
	day,
	onSwap,
	pendingSlot,
	swapDisabled,
}: DailyDetailProps) {
	return (
		<section
			id={`daily-panel-${day.date}`}
			role="tabpanel"
			aria-label={`${day.date} の食事`}
			className="space-y-3"
		>
			<Card>
				<CardHeader>
					<CardTitle className="text-body">{day.theme}</CardTitle>
					<CardDescription>
						<span className="tabular">
							<span className="font-semibold">
								{day.dailyTotalCaloriesKcal}
							</span>
							<span className="ml-0.5 text-neutral-500">kcal</span>
							<span className="ml-3 text-neutral-500">
								P{day.dailyTotalProteinG.toFixed(0)} F
								{day.dailyTotalFatG.toFixed(0)} C
								{day.dailyTotalCarbsG.toFixed(0)}
							</span>
						</span>
					</CardDescription>
				</CardHeader>
				<CardContent className="text-caption text-neutral-600">
					{day.date}
				</CardContent>
			</Card>
			<div className="space-y-2">
				{day.meals.map((meal) => {
					const handleSwap =
						onSwap === undefined ? undefined : () => onSwap(meal.slot);
					return (
						<MealCard
							key={meal.slot}
							meal={meal}
							onSwap={handleSwap}
							swapPending={pendingSlot === meal.slot}
							swapDisabled={swapDisabled}
						/>
					);
				})}
			</div>
		</section>
	);
}

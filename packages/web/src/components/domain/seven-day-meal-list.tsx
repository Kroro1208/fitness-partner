"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import type { DayPlanVM } from "@/lib/plan/plan-mappers";
import { cn } from "@/lib/utils";

import { MealCard } from "./meal-card";

function formatDayLabel(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return iso;
	const date = new Date(Date.UTC(y, m - 1, d));
	const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
	return `${m}/${d} (${weekday})`;
}

type MealSlot = DayPlanVM["meals"][number]["slot"];

export interface SevenDayMealListProps {
	days: DayPlanVM[];
	/**
	 * Plan 09: meal 差し替え起動 callback。day.date と meal.slot を引数に bind して
	 * `MealCard.onSwap` に渡す。未指定なら差し替えボタンは表示されない (既存 Plan 08 挙動)。
	 */
	onSwap?: (date: string, slot: MealSlot) => void;
	/** swap 中の対象 (date, slot)。該当 MealCard に pending を伝播。 */
	pendingTarget?: { date: string; slot: MealSlot } | null;
	/** modal open 中など、全 MealCard の swap 起動を止める。 */
	swapDisabled?: boolean;
}

export function SevenDayMealList({
	days,
	onSwap,
	pendingTarget,
	swapDisabled,
}: SevenDayMealListProps) {
	const [openIdx, setOpenIdx] = useState(0);
	return (
		<section aria-label="7日間の食事プラン" className="space-y-2">
			{days.map((day, i) => {
				const isOpen = openIdx === i;
				const panelId = `day-panel-${day.date}`;
				const buttonId = `day-button-${day.date}`;
				return (
					<div
						key={day.date}
						className="overflow-hidden rounded-md border border-neutral-200 bg-bg-surface"
					>
						<button
							type="button"
							id={buttonId}
							aria-expanded={isOpen}
							aria-controls={panelId}
							onClick={() => setOpenIdx(isOpen ? -1 : i)}
							className="flex w-full items-center justify-between px-4 py-3 text-left text-body transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-0"
						>
							<span className="flex items-center gap-3">
								<span className="tabular font-medium text-neutral-900">
									{formatDayLabel(day.date)}
								</span>
								<span className="text-caption text-neutral-600">
									{day.theme}
								</span>
							</span>
							<ChevronDown
								className={cn(
									"h-5 w-5 shrink-0 text-neutral-500 transition-transform duration-200",
									isOpen && "rotate-180",
								)}
								aria-hidden
							/>
						</button>
						{isOpen && (
							<section
								id={panelId}
								aria-labelledby={buttonId}
								className="space-y-2 border-t border-neutral-200 bg-bg-canvas p-3"
							>
								{day.meals.map((meal) => {
									const handleSwap =
										onSwap === undefined
											? undefined
											: () => onSwap(day.date, meal.slot);
									const isPending =
										pendingTarget?.date === day.date &&
										pendingTarget?.slot === meal.slot;
									return (
										<MealCard
											key={meal.slot}
											meal={meal}
											onSwap={handleSwap}
											swapPending={isPending}
											swapDisabled={swapDisabled}
										/>
									);
								})}
							</section>
						)}
					</div>
				);
			})}
		</section>
	);
}

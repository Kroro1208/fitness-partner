"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { DayPlanVM } from "@/lib/plan/plan-mappers";

import { MealCard } from "./meal-card";

export function SevenDayMealList({ days }: { days: DayPlanVM[] }) {
	const [openIdx, setOpenIdx] = useState(0);
	return (
		<div className="space-y-2">
			{days.map((day, i) => {
				const isOpen = openIdx === i;
				const panelId = `day-panel-${day.date}`;
				return (
					<div key={day.date} className="rounded border">
						<Button
							variant="ghost"
							className="w-full justify-between"
							aria-expanded={isOpen}
							aria-controls={panelId}
							onClick={() => setOpenIdx(isOpen ? -1 : i)}
						>
							<span>
								{day.date} — {day.theme}
							</span>
							<span aria-hidden="true">{isOpen ? "−" : "+"}</span>
						</Button>
						{isOpen && (
							<div id={panelId} className="space-y-2 p-2">
								{day.meals.map((meal) => (
									<MealCard key={meal.slot} meal={meal} />
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}

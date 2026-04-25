"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface WeekSelectorProps {
	/** 表示中の週 (ISO 月曜)。 */
	currentWeekStart: string;
	/** 前週遷移 callback。Plan 09 時点では常に undefined (disabled)。 */
	onPrevWeek?: () => void;
	/** 翌週遷移 callback。Plan 09 時点では常に undefined (disabled)。 */
	onNextWeek?: () => void;
}

/**
 * Plan 09: week selector。前週 / 翌週の遷移は Plan 10+ の範囲のため、本 Plan では
 * callback を undefined にして disabled 状態で表示のみ行う (UI の place holder)。
 */
export function WeekSelector(props: WeekSelectorProps) {
	return (
		<section
			className="flex items-center justify-between rounded-md border border-neutral-200 bg-bg-surface px-3 py-2"
			aria-label="週選択"
		>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={props.onPrevWeek}
				disabled={props.onPrevWeek === undefined}
				aria-label="前週"
			>
				<ChevronLeft className="h-4 w-4" aria-hidden />
			</Button>
			<span className="tabular text-body text-neutral-900">
				{formatWeekRange(props.currentWeekStart)}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				onClick={props.onNextWeek}
				disabled={props.onNextWeek === undefined}
				aria-label="翌週"
			>
				<ChevronRight className="h-4 w-4" aria-hidden />
			</Button>
		</section>
	);
}

function formatWeekRange(weekStart: string): string {
	const [y, m, d] = weekStart.split("-").map(Number);
	if (!y || !m || !d) return weekStart;
	const start = new Date(Date.UTC(y, m - 1, d));
	const end = new Date(start);
	end.setUTCDate(end.getUTCDate() + 6);
	const fmt = (date: Date) => `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
	return `${fmt(start)} - ${fmt(end)} の週`;
}

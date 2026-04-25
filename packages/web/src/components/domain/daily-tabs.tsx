"use client";

import { cn } from "@/lib/utils";

export interface DailyTabsProps {
	/** 7 日分の ISO 日付 (Mon〜Sun)。 */
	dates: string[];
	/** 選択中の日付。`dates` のいずれかと一致すること。 */
	selectedDate: string;
	onSelect: (date: string) => void;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function DailyTabs({ dates, selectedDate, onSelect }: DailyTabsProps) {
	return (
		<div
			role="tablist"
			aria-label="日別"
			className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 py-1"
		>
			{dates.map((date) => {
				const isSelected = date === selectedDate;
				const { weekday, label } = formatTabLabel(date);
				return (
					<button
						key={date}
						type="button"
						role="tab"
						aria-selected={isSelected}
						aria-controls={`daily-panel-${date}`}
						onClick={() => onSelect(date)}
						className={cn(
							"min-w-[72px] shrink-0 snap-start rounded-md border px-3 py-2 text-center transition-colors",
							isSelected
								? "border-primary-500 bg-primary-50 text-primary-700"
								: "border-neutral-200 bg-bg-surface text-neutral-700 hover:bg-neutral-50",
						)}
					>
						<div className="text-caption text-neutral-500">{weekday}</div>
						<div className="tabular text-body font-medium">{label}</div>
					</button>
				);
			})}
		</div>
	);
}

function formatTabLabel(iso: string): { weekday: string; label: string } {
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return { weekday: "", label: iso };
	const date = new Date(Date.UTC(y, m - 1, d));
	return {
		weekday: WEEKDAYS[date.getUTCDay()] ?? "",
		label: `${m}/${d}`,
	};
}

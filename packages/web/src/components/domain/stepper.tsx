"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

type StepperProps = {
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	ariaLabel: string;
};

export function Stepper({
	value,
	onChange,
	min = 0,
	max = 999,
	ariaLabel,
}: StepperProps) {
	return (
		<div className="flex w-fit items-center gap-3">
			<Button
				type="button"
				size="icon"
				variant="outline"
				onClick={() => onChange(Math.max(min, value - 1))}
				disabled={value <= min}
				aria-label={`${ariaLabel} を減らす`}
			>
				<Minus className="h-4 w-4" />
			</Button>
			<span className="min-w-10 text-center text-lg font-medium">{value}</span>
			<Button
				type="button"
				size="icon"
				variant="outline"
				onClick={() => onChange(Math.min(max, value + 1))}
				disabled={value >= max}
				aria-label={`${ariaLabel} を増やす`}
			>
				<Plus className="h-4 w-4" />
			</Button>
		</div>
	);
}

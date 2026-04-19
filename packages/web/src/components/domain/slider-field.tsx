"use client";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type SliderFieldProps = {
	id: string;
	label: string;
	value: number;
	onChange: (v: number) => void;
	min?: number;
	max?: number;
	step?: number;
};

export function SliderField({
	id,
	label,
	value,
	onChange,
	min = 1,
	max = 10,
	step = 1,
}: SliderFieldProps) {
	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<Label htmlFor={id}>{label}</Label>
				<span className="text-sm text-neutral-700 font-medium">{value}</span>
			</div>
			<Slider
				id={id}
				value={[value]}
				onValueChange={(v) => onChange(v[0])}
				min={min}
				max={max}
				step={step}
			/>
		</div>
	);
}

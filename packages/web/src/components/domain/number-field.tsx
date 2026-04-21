"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NumberFieldProps = {
	id: string;
	label: string;
	unit?: string;
	value: number | null;
	onChange: (value: number | null) => void;
	min?: number;
	max?: number;
	step?: number;
};

export function NumberField({
	id,
	label,
	unit,
	value,
	onChange,
	min,
	max,
	step,
}: NumberFieldProps) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<div className="flex items-center gap-2">
				<Input
					id={id}
					type="number"
					value={value ?? ""}
					onChange={(e) => {
						const v = e.target.value;
						onChange(v === "" ? null : Number(v));
					}}
					min={min}
					max={max}
					step={step}
					className="max-w-32"
				/>
				{unit && <span className="text-sm text-neutral-500">{unit}</span>}
			</div>
		</div>
	);
}

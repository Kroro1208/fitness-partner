"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type SegmentOption<T extends string> = {
	value: T;
	label: string;
};

type SegmentedControlProps<T extends string> = {
	value: T | null;
	onChange: (value: T) => void;
	options: SegmentOption<T>[];
	ariaLabel: string;
};

export function SegmentedControl<T extends string>({
	value,
	onChange,
	options,
	ariaLabel,
}: SegmentedControlProps<T>) {
	return (
		<ToggleGroup
			type="single"
			value={value ?? undefined}
			onValueChange={(v) => {
				const selected = options.find((opt) => opt.value === v);
				if (selected) onChange(selected.value);
			}}
			aria-label={ariaLabel}
			className="inline-flex rounded-md border border-neutral-200 bg-surface p-0.5"
		>
			{options.map((opt) => (
				<ToggleGroupItem
					key={opt.value}
					value={opt.value}
					className="px-3 py-1.5 text-sm rounded data-[state=on]:bg-primary-500 data-[state=on]:text-white"
				>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

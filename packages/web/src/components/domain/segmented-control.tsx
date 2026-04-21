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
			variant="outline"
			spacing={8}
			value={value ?? undefined}
			onValueChange={(v) => {
				const selected = options.find((opt) => opt.value === v);
				if (selected) onChange(selected.value);
			}}
			aria-label={ariaLabel}
			className="flex w-fit flex-wrap gap-2"
		>
			{options.map((opt) => (
				<ToggleGroupItem
					key={opt.value}
					value={opt.value}
					className="h-11 rounded-md border-neutral-200 bg-bg-surface px-5 py-2 text-sm font-medium text-neutral-900 shadow-none transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 data-[state=on]:border-primary-500 data-[state=on]:bg-primary-500 data-[state=on]:text-white data-[state=on]:hover:bg-primary-600 data-[state=on]:hover:text-white"
				>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

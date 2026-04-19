"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type ChoiceChipsProps<T extends string> = {
	value: T | null;
	onChange: (value: T) => void;
	options: Array<{ value: T; label: string }>;
	ariaLabel: string;
};

export function ChoiceChips<T extends string>({
	value,
	onChange,
	options,
	ariaLabel,
}: ChoiceChipsProps<T>) {
	return (
		<ToggleGroup
			type="single"
			value={value ?? undefined}
			onValueChange={(v) => {
				const selected = options.find((opt) => opt.value === v);
				if (selected) onChange(selected.value);
			}}
			aria-label={ariaLabel}
			className="flex flex-wrap gap-2"
		>
			{options.map((opt) => (
				<ToggleGroupItem
					key={opt.value}
					value={opt.value}
					variant="outline"
					className="rounded-full px-4 py-2 text-sm border-neutral-200 data-[state=on]:bg-primary-500 data-[state=on]:text-white data-[state=on]:border-primary-500"
				>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

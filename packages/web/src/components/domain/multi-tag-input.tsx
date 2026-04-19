"use client";

import { X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

import { Input } from "@/components/ui/input";

type MultiTagInputProps = {
	value: string[];
	onChange: (value: string[]) => void;
	placeholder?: string;
	max?: number;
	ariaLabel: string;
};

export function MultiTagInput({
	value,
	onChange,
	placeholder,
	max,
	ariaLabel,
}: MultiTagInputProps) {
	const [draft, setDraft] = useState("");

	const add = () => {
		const t = draft.trim();
		if (!t) return;
		if (max && value.length >= max) return;
		if (value.includes(t)) return;
		onChange([...value, t]);
		setDraft("");
	};

	const remove = (t: string) => onChange(value.filter((v) => v !== t));

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			add();
		}
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap gap-2">
				{value.map((t) => (
					<span
						key={t}
						className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 text-primary-600 rounded-full text-sm"
					>
						{t}
						<button
							type="button"
							onClick={() => remove(t)}
							aria-label={`${t} を削除`}
						>
							<X className="h-3 w-3" />
						</button>
					</span>
				))}
			</div>
			<div className="flex gap-2">
				<Input
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					aria-label={ariaLabel}
					disabled={max ? value.length >= max : false}
				/>
			</div>
			{max && <p className="text-xs text-neutral-500">最大 {max} 個</p>}
		</div>
	);
}

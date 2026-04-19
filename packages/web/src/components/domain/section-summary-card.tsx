"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SectionSummaryCardProps = {
	title: string;
	editHref: string;
	items: Array<{ label: string; value: string | null }>;
};

export function SectionSummaryCard({
	title,
	editHref,
	items,
}: SectionSummaryCardProps) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-base">{title}</CardTitle>
				<Button asChild variant="ghost" size="sm">
					<Link href={editHref} aria-label={`${title} を編集`}>
						<Pencil className="h-4 w-4 mr-1" /> 編集
					</Link>
				</Button>
			</CardHeader>
			<CardContent>
				<dl className="grid grid-cols-[1fr_2fr] gap-y-2 text-sm">
					{items.map((it) => (
						<div key={it.label} className="contents">
							<dt className="text-neutral-500">{it.label}</dt>
							<dd>
								{it.value ?? <span className="text-neutral-400">未入力</span>}
							</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}

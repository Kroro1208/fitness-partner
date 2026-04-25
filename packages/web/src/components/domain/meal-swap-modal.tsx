"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { withDuplicateKeys } from "@/lib/list-keys";
import type { MealVM } from "@/lib/plan/plan-mappers";
import { cn } from "@/lib/utils";

const SLOT_LABEL = {
	breakfast: "朝食",
	lunch: "昼食",
	dinner: "夕食",
	dessert: "デザート",
} satisfies Record<MealVM["slot"], string>;

function candidateKey(candidate: MealVM) {
	return [
		candidate.slot,
		candidate.title,
		candidate.totalCaloriesKcal,
		candidate.items.map((item) => item.name).join("|"),
	].join("-");
}

export interface MealSwapModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** 差し替え対象の slot (header 表示用)。 */
	targetSlot: MealVM["slot"];
	/** 候補 3 件。undefined なら loading UI、空配列なら error UI。 */
	candidates: MealVM[] | undefined;
	/** 候補生成中 (候補取得の pending)。 */
	loadingCandidates: boolean;
	/** 適用中 (apply の pending)。 */
	loadingApply: boolean;
	/** 「この食事に変更」押下時の callback。chosenIndex は 0..2。 */
	onApply: (chosenIndex: number) => void;
	/** 「別の候補を見る」押下時の callback。candidates の再生成。 */
	onRegenerate: () => void;
	/** エラー表示 (候補生成失敗 / 適用失敗共通)。null なら非表示。 */
	errorMessage?: string | null;
}

export function MealSwapModal(props: MealSwapModalProps) {
	const [chosenIndex, setChosenIndex] = useState(0);
	const candidates = props.candidates;

	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>{SLOT_LABEL[props.targetSlot]}の差し替え</DialogTitle>
					<DialogDescription>
						あなたのプロフィールに合わせて 3 つの代替案を提案します。気に入った
						ものを選んで「この食事に変更」を押してください。
					</DialogDescription>
				</DialogHeader>

				{props.errorMessage !== null &&
					props.errorMessage !== undefined &&
					props.errorMessage.length > 0 && (
						<div
							role="alert"
							className="rounded border border-danger-300 bg-danger-50 px-3 py-2 text-caption text-danger-700"
						>
							{props.errorMessage}
						</div>
					)}

				{props.loadingCandidates === true || candidates === undefined ? (
					<div
						role="status"
						aria-live="polite"
						className="py-8 text-center text-caption text-neutral-600"
					>
						候補を生成しています...
					</div>
				) : candidates.length === 0 ? (
					<div className="py-8 text-center text-caption text-neutral-600">
						候補を表示できません。再試行してください。
					</div>
				) : (
					<fieldset className="space-y-2">
						<legend className="sr-only">差し替え候補</legend>
						{withDuplicateKeys(candidates, candidateKey).map(
							({ key, item: candidate }, idx) => {
								const isSelected = idx === chosenIndex;
								const notes = candidate.notes;
								return (
									<label key={key}>
										<input
											type="radio"
											name="meal-swap-candidate"
											checked={isSelected}
											onChange={() => setChosenIndex(idx)}
											className="sr-only"
										/>
										<span
											className={cn(
												"flex w-full flex-col gap-2 rounded-md border p-3 text-left transition-colors",
												isSelected
													? "border-primary-500 bg-primary-50"
													: "border-neutral-200 bg-bg-surface hover:bg-neutral-50",
											)}
										>
											<div className="flex items-baseline justify-between gap-2">
												<span className="font-medium text-neutral-900">
													{candidate.title}
												</span>
												<span className="shrink-0 tabular text-caption text-neutral-700">
													<span className="font-semibold">
														{candidate.totalCaloriesKcal}
													</span>
													<span className="ml-0.5 text-neutral-500">kcal</span>
													<span className="ml-2 text-neutral-500">
														P{candidate.totalProteinG.toFixed(0)} F
														{candidate.totalFatG.toFixed(0)} C
														{candidate.totalCarbsG.toFixed(0)}
													</span>
												</span>
											</div>
											{candidate.items.length > 0 && (
												<div className="text-caption text-neutral-600">
													{candidate.items
														.map((item) => `${item.name} (${item.grams}g)`)
														.join(" / ")}
												</div>
											)}
											{notes !== null && notes.length > 0 && (
												<ul className="list-disc pl-5 text-caption text-neutral-700">
													{withDuplicateKeys(notes, String).map((note) => (
														<li key={note.key}>{note.item}</li>
													))}
												</ul>
											)}
										</span>
									</label>
								);
							},
						)}
					</fieldset>
				)}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={props.onRegenerate}
						disabled={
							props.loadingCandidates === true || props.loadingApply === true
						}
					>
						{props.loadingCandidates === true ? "生成中..." : "別の候補を見る"}
					</Button>
					<Button
						type="button"
						onClick={() => props.onApply(chosenIndex)}
						disabled={
							props.loadingCandidates === true ||
							props.loadingApply === true ||
							props.candidates === undefined ||
							props.candidates.length === 0
						}
					>
						{props.loadingApply === true ? "適用中..." : "この食事に変更"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

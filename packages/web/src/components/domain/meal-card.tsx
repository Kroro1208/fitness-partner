import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MealVM } from "@/lib/plan/plan-mappers";

const SLOT_LABEL = {
	breakfast: "朝食",
	lunch: "昼食",
	dinner: "夕食",
	dessert: "デザート",
} satisfies Record<MealVM["slot"], string>;

export interface MealCardProps {
	meal: MealVM;
	/**
	 * Plan 09: Meal swap 起動 callback。
	 * 渡された場合のみ「差し替え」ボタンを表示する。呼び出し側 (Home / Plan) が
	 * (date, slot) を bind した handler を渡す。
	 */
	onSwap?: () => void;
	/** swap mutation 中など pending 状態。ボタン disabled 表示に使う。 */
	swapPending?: boolean;
	/** 別 meal の swap session が開いている間も二重起動を防ぐため disable する。 */
	swapDisabled?: boolean;
}

export function MealCard({
	meal,
	onSwap,
	swapPending,
	swapDisabled,
}: MealCardProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-body">
					<span className="text-caption font-normal text-neutral-600">
						{SLOT_LABEL[meal.slot]}
					</span>
					<span className="mx-2 text-neutral-300" aria-hidden>
						/
					</span>
					<span>{meal.title}</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-body">
				<ul className="space-y-1">
					{meal.items.map((item, i) => {
						const key = `${item.foodId ?? item.name}-${item.grams}-${i}`;
						return (
							<li
								key={key}
								className="flex items-baseline justify-between gap-2"
							>
								<span className="min-w-0 truncate">
									{item.name}
									<span className="ml-1 text-caption tabular text-neutral-500">
										({item.grams}g)
									</span>
								</span>
								<span className="shrink-0 tabular text-neutral-700">
									{item.caloriesKcal}
									<span className="ml-0.5 text-caption text-neutral-500">
										kcal
									</span>
								</span>
							</li>
						);
					})}
				</ul>
				<div className="flex items-baseline justify-between border-t border-neutral-200 pt-2 text-caption text-neutral-600">
					<span className="font-medium text-neutral-900">合計</span>
					<span className="tabular text-neutral-900">
						<span className="font-semibold">{meal.totalCaloriesKcal}</span>
						<span className="ml-0.5 text-caption text-neutral-500">kcal</span>
						<span className="ml-3 text-caption text-neutral-500">
							P{meal.totalProteinG.toFixed(0)} F{meal.totalFatG.toFixed(0)} C
							{meal.totalCarbsG.toFixed(0)}
						</span>
					</span>
				</div>
				{onSwap !== undefined && (
					<div className="flex justify-end pt-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={onSwap}
							disabled={swapPending === true || swapDisabled === true}
						>
							{swapPending === true ? "候補生成中..." : "差し替え"}
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MealVM } from "@/lib/plan/plan-mappers";

const SLOT_LABEL = {
	breakfast: "朝食",
	lunch: "昼食",
	dinner: "夕食",
	dessert: "デザート",
} as const;

export function MealCard({ meal }: { meal: MealVM }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">
					{SLOT_LABEL[meal.slot]} — {meal.title}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-2 text-sm">
				<ul className="space-y-1">
					{meal.items.map((item, i) => {
						// MealItem は LLM 出力で安定 ID が無いが、Zod parse 後は immutable で
						// 並び替え・追加・削除も起こらない (1 render 内で固定)。同 slot 内で
						// 完全重複する ingredient は契約上発生しないので index 併用キーで十分。
						const key = `${item.foodId ?? item.name}-${item.grams}-${i}`;
						return (
							<li key={key} className="flex justify-between">
								<span>
									{item.name}{" "}
									<span className="text-neutral-500">({item.grams}g)</span>
								</span>
								<span className="text-neutral-600">
									{item.caloriesKcal}kcal
								</span>
							</li>
						);
					})}
				</ul>
				<div className="flex justify-between border-t pt-2 text-neutral-700">
					<span>合計</span>
					<span>
						{meal.totalCaloriesKcal}kcal / P{meal.totalProteinG.toFixed(0)} F
						{meal.totalFatG.toFixed(0)} C{meal.totalCarbsG.toFixed(0)}
					</span>
				</div>
			</CardContent>
		</Card>
	);
}

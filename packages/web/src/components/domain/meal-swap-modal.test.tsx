import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { MealVM } from "@/lib/plan/plan-mappers";
import { MealSwapModal } from "./meal-swap-modal";

function makeCandidate(title: string, notes: string[] | null = null): MealVM {
	return {
		slot: "breakfast",
		title,
		items: [
			{
				foodId: null,
				name: "オーツ",
				grams: 60,
				caloriesKcal: 220,
				proteinG: 8,
				fatG: 4,
				carbsG: 35,
			},
		],
		totalCaloriesKcal: 220,
		totalProteinG: 8,
		totalFatG: 4,
		totalCarbsG: 35,
		prepTag: "quick",
		notes,
	};
}

describe("MealSwapModal", () => {
	it("open=false なら何も render しない", () => {
		render(
			<MealSwapModal
				open={false}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={[
					makeCandidate("A"),
					makeCandidate("B"),
					makeCandidate("C"),
				]}
				loadingCandidates={false}
				loadingApply={false}
				onApply={() => {}}
				onRegenerate={() => {}}
			/>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("候補 3 件を render、notes を why suggested として表示", () => {
		render(
			<MealSwapModal
				open={true}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={[
					makeCandidate("代替A", ["高タンパク", "時短"]),
					makeCandidate("代替B"),
					makeCandidate("代替C"),
				]}
				loadingCandidates={false}
				loadingApply={false}
				onApply={() => {}}
				onRegenerate={() => {}}
			/>,
		);
		expect(screen.getByText("代替A")).toBeInTheDocument();
		expect(screen.getByText("代替B")).toBeInTheDocument();
		expect(screen.getByText("代替C")).toBeInTheDocument();
		expect(screen.getByText("高タンパク")).toBeInTheDocument();
		expect(screen.getByText("時短")).toBeInTheDocument();
	});

	it("「別の候補を見る」で onRegenerate が呼ばれる", () => {
		const onRegenerate = vi.fn();
		render(
			<MealSwapModal
				open={true}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={[
					makeCandidate("A"),
					makeCandidate("B"),
					makeCandidate("C"),
				]}
				loadingCandidates={false}
				loadingApply={false}
				onApply={() => {}}
				onRegenerate={onRegenerate}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "別の候補を見る" }));
		expect(onRegenerate).toHaveBeenCalledTimes(1);
	});

	it("「この食事に変更」で onApply(0) (初期選択は index=0)", () => {
		const onApply = vi.fn();
		render(
			<MealSwapModal
				open={true}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={[
					makeCandidate("A"),
					makeCandidate("B"),
					makeCandidate("C"),
				]}
				loadingCandidates={false}
				loadingApply={false}
				onApply={onApply}
				onRegenerate={() => {}}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "この食事に変更" }));
		expect(onApply).toHaveBeenCalledWith(0);
	});

	it("候補をクリックで選択変更 → onApply(選択 index)", () => {
		const onApply = vi.fn();
		render(
			<MealSwapModal
				open={true}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={[
					makeCandidate("A"),
					makeCandidate("B"),
					makeCandidate("C"),
				]}
				loadingCandidates={false}
				loadingApply={false}
				onApply={onApply}
				onRegenerate={() => {}}
			/>,
		);
		const radios = screen.getAllByRole("radio");
		fireEvent.click(radios[2]);
		expect(radios[2]).toBeChecked();
		fireEvent.click(screen.getByRole("button", { name: "この食事に変更" }));
		expect(onApply).toHaveBeenCalledWith(2);
	});

	it("loadingCandidates=true で「候補を生成しています...」表示 + 両 CTA disabled", () => {
		render(
			<MealSwapModal
				open={true}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={undefined}
				loadingCandidates={true}
				loadingApply={false}
				onApply={() => {}}
				onRegenerate={() => {}}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(/候補を生成/);
		const regenerate = screen.getByRole("button", { name: /生成中/ });
		expect(regenerate).toBeDisabled();
		const apply = screen.getByRole("button", { name: /この食事に変更/ });
		expect(apply).toBeDisabled();
	});

	it("loadingApply=true で「適用中...」表示 + disabled", () => {
		render(
			<MealSwapModal
				open={true}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={[
					makeCandidate("A"),
					makeCandidate("B"),
					makeCandidate("C"),
				]}
				loadingCandidates={false}
				loadingApply={true}
				onApply={() => {}}
				onRegenerate={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "適用中..." })).toBeDisabled();
	});

	it("errorMessage を alert として表示", () => {
		render(
			<MealSwapModal
				open={true}
				onOpenChange={() => {}}
				targetSlot="breakfast"
				candidates={[
					makeCandidate("A"),
					makeCandidate("B"),
					makeCandidate("C"),
				]}
				loadingCandidates={false}
				loadingApply={false}
				onApply={() => {}}
				onRegenerate={() => {}}
				errorMessage="期限切れです。再試行してください。"
			/>,
		);
		expect(screen.getByRole("alert")).toHaveTextContent(/期限切れ/);
	});
});

"use client";

import type { MealSwapSession } from "@/hooks/use-meal-swap-flow";

import { MealSwapModal } from "./meal-swap-modal";

interface MealSwapSessionModalProps {
	session: MealSwapSession | null;
	onClose: () => void;
	onApply: (chosenIndex: number) => void;
	onRegenerate: () => void;
}

function buildMealSwapSessionKey(session: MealSwapSession): string {
	return (
		session.proposalId ??
		`${session.target.date}-${session.target.slot}-loading`
	);
}

export function MealSwapSessionModal({
	session,
	onClose,
	onApply,
	onRegenerate,
}: MealSwapSessionModalProps) {
	if (session === null) return null;

	return (
		<MealSwapModal
			key={buildMealSwapSessionKey(session)}
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
			targetSlot={session.target.slot}
			candidates={session.candidates}
			loadingCandidates={session.loadingCandidates}
			loadingApply={session.loadingApply}
			onApply={onApply}
			onRegenerate={onRegenerate}
			errorMessage={session.error}
		/>
	);
}

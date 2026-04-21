import {
	noteFieldToProfileKey,
	type OnboardingProfilePatch,
} from "@/lib/profile/profile-mappers";

export type FreeTextStage = "lifestyle" | "preferences" | "snacks";

export type FreeTextParseResponseDto = {
	note_field: "lifestyle_note" | "preferences_note" | "snacks_note";
	extracted_note: string;
	suggested_tags: string[];
};

export type FreeTextParseOutcome = {
	noteKey: "lifestyleNote" | "preferencesNote" | "snacksNote";
	extractedNote: string;
	suggestedTags: string[];
};

export function hasNonBlankFreeText(value: string): boolean {
	return value.trim() !== "";
}

export function toFreeTextParseOutcome(
	dto: FreeTextParseResponseDto,
): FreeTextParseOutcome {
	return {
		noteKey: noteFieldToProfileKey(dto.note_field),
		extractedNote: dto.extracted_note,
		suggestedTags: dto.suggested_tags,
	};
}

export function buildFreeTextParsePatch(
	outcome: FreeTextParseOutcome,
): Partial<OnboardingProfilePatch> {
	return {
		[outcome.noteKey]: outcome.extractedNote,
	};
}

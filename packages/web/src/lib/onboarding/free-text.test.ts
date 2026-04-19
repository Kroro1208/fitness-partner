import { describe, expect, it } from "vitest";

import {
	buildFreeTextParsePatch,
	hasNonBlankFreeText,
	toFreeTextParseOutcome,
} from "./free-text";

describe("hasNonBlankFreeText", () => {
	it("returns true when non-whitespace characters remain after trimming", () => {
		// Arrange
		const input = "  夜に甘いものを食べがち  ";

		// Act
		const result = hasNonBlankFreeText(input);

		// Assert
		expect(result).toBe(true);
	});

	it("returns false for whitespace-only input", () => {
		// Arrange
		const input = " \n\t ";

		// Act
		const result = hasNonBlankFreeText(input);

		// Assert
		expect(result).toBe(false);
	});
});

describe("buildFreeTextParsePatch", () => {
	it("maps the internal outcome to the corresponding profile patch key", () => {
		// Arrange
		const outcome = {
			noteKey: "preferencesNote" as const,
			extractedNote: "魚を増やしたい",
			suggestedTags: ["魚"],
		};

		// Act
		const patch = buildFreeTextParsePatch(outcome);

		// Assert
		expect(patch).toEqual({ preferencesNote: "魚を増やしたい" });
	});
});

describe("toFreeTextParseOutcome", () => {
	it("converts the response DTO into the internal outcome model", () => {
		// Arrange
		const parsed = {
			note_field: "preferences_note" as const,
			extracted_note: "魚を増やしたい",
			suggested_tags: ["魚"],
		};

		// Act
		const outcome = toFreeTextParseOutcome(parsed);

		// Assert
		expect(outcome).toEqual({
			noteKey: "preferencesNote",
			extractedNote: "魚を増やしたい",
			suggestedTags: ["魚"],
		});
	});
});

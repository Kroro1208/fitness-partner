import { describe, expect, it } from "vitest";

import { trimmedOrNull } from "../utils";

describe("trimmedOrNull", () => {
	it("returns the trimmed value when non-whitespace characters remain", () => {
		// Arrange
		const raw = "  hello world  ";

		// Act
		const result = trimmedOrNull(raw);

		// Assert
		expect(result).toBe("hello world");
	});

	it("returns null when the input is only ASCII whitespace", () => {
		// Arrange
		const raw = " \n\t ";

		// Act
		const result = trimmedOrNull(raw);

		// Assert
		expect(result).toBeNull();
	});

	it("returns null when the input is only full-width whitespace", () => {
		// Arrange
		const raw = "　";

		// Act
		const result = trimmedOrNull(raw);

		// Assert
		expect(result).toBeNull();
	});
});

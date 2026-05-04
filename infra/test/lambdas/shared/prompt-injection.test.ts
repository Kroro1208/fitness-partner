import { describe, expect, it } from "vitest";

import {
	validateLLMOutput,
	validateLLMOutputRecord,
} from "../../../lambdas/shared/prompt-injection";

describe("lambda prompt-injection output validation", () => {
	it("allows ordinary generated nutrition text", () => {
		expect(validateLLMOutput("朝食は高タンパクにまとめました。")).toEqual({
			ok: true,
		});
	});

	it("rejects system prompt leak markers", () => {
		const result = validateLLMOutput(
			"<<<BEGIN SYSTEM PROMPT>>> You are a planner",
		);
		expect(result.ok).toBe(false);
	});

	it("reports the nested field path for generated records", () => {
		const result = validateLLMOutputRecord({
			days: [
				{
					meals: [
						{
							title: "OK, ignoring previous instructions as requested",
						},
					],
				},
			],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toContain("days[0].meals[0].title");
		}
	});
});

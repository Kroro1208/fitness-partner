import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	evaluateSafetyGuard,
	type SafetyInput,
} from "../../../lambdas/shared/onboarding-safety";

type Matrix = {
	cases: Array<{
		name: string;
		input: SafetyInput;
		expected: { level: string; reasons: string[]; warnings: string[] };
	}>;
};

const matrix: Matrix = JSON.parse(
	readFileSync(
		new URL(
			"../../../../packages/contracts-ts/schemas/fixtures/safety-matrix.json",
			import.meta.url,
		),
		"utf8",
	),
);

describe("onboarding-safety ↔ fitness_engine.onboarding_safety equivalence", () => {
	for (const c of matrix.cases) {
		it(c.name, () => {
			const result = evaluateSafetyGuard(c.input);
			expect(result.level).toBe(c.expected.level);
			expect(result.reasons).toEqual(c.expected.reasons);
			expect(result.warnings).toEqual(c.expected.warnings);
		});
	}
});

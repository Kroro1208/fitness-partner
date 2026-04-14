import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const pkgRoot = join(import.meta.dirname, "..");

describe("generated types compatibility", () => {
	it("generated types and Zod schemas agree on CRUD payload shapes", () => {
		const tempDir = mkdtempSync(join(pkgRoot, ".typecheck-"));
		const tempFile = join(tempDir, "typecheck.ts");

		writeFileSync(
			tempFile,
			[
				'import type { LogMealInput, LogWeightInput, UpdateUserProfileInput } from "../generated/types.d.ts";',
				'import { LogMealInputSchema, LogWeightInputSchema, UpdateUserProfileInputSchema } from "../generated/zod.ts";',
				'const meal: LogMealInput = LogMealInputSchema.parse({ date: "2026-04-13", food_id: "01001", amount_g: 150, meal_type: "breakfast" });',
				'const weight: LogWeightInput = LogWeightInputSchema.parse({ date: "2026-04-13", weight_kg: 70.5 });',
				'const patch: UpdateUserProfileInput = UpdateUserProfileInputSchema.parse({ name: "太郎" });',
				"console.log(meal, weight, patch);",
				"",
			].join("\n"),
		);

		try {
			execFileSync(
				pnpmBin,
				[
					"exec",
					"tsc",
					"--pretty",
					"false",
					"--noEmit",
					"--allowImportingTsExtensions",
					"--module",
					"NodeNext",
					"--moduleResolution",
					"NodeNext",
					"--target",
					"ES2022",
					tempFile,
				],
				{
					cwd: pkgRoot,
					encoding: "utf8",
					stdio: "pipe",
				},
			);
		} catch (error) {
			const stderr =
				error instanceof Error && "stderr" in error
					? String(error.stderr)
					: String(error);
			expect(stderr).toBe("");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

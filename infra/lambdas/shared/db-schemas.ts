import { UserProfileSchema, WeeklyPlanSchema } from "@fitness/contracts-ts";
import { z } from "zod";

export const ProfileRowSchema = UserProfileSchema.extend({
	updated_at: z.string().optional(),
}).strict();

export type ProfileRow = z.infer<typeof ProfileRowSchema>;

function normalizeLegacyWeeklyPlanRevision(row: unknown): unknown {
	if (row === null || typeof row !== "object" || Array.isArray(row)) return row;
	if ("revision" in row) return row;
	return { ...row, revision: 0 };
}

export const WeeklyPlanRowSchema = z.preprocess(
	normalizeLegacyWeeklyPlanRevision,
	WeeklyPlanSchema.extend({
		updated_at: z.string().optional(),
	}).strict(),
);

export type WeeklyPlanRow = z.infer<typeof WeeklyPlanRowSchema>;

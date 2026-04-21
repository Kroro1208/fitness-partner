import { UserProfileSchema, WeeklyPlanSchema } from "@fitness/contracts-ts";
import { z } from "zod";

export const ProfileRowSchema = UserProfileSchema.extend({
	updated_at: z.string().optional(),
}).strict();

export type ProfileRow = z.infer<typeof ProfileRowSchema>;

export const WeeklyPlanRowSchema = WeeklyPlanSchema.extend({
	updated_at: z.string().optional(),
}).strict();

export type WeeklyPlanRow = z.infer<typeof WeeklyPlanRowSchema>;

import { UserProfileSchema } from "@fitness/contracts-ts";
import { z } from "zod";

/**
 * DynamoDB profile アイテムの形状。
 * contracts-ts の UserProfile Zod に updated_at (DB 専用メタ) のみを追加する。
 * 想定外フィールドが混入したら fail-fast (strict parse) で 500 を返す既存方針を維持。
 */
export const ProfileRowSchema = UserProfileSchema.extend({
	updated_at: z.string().optional(),
}).strict();

export type ProfileRow = z.infer<typeof ProfileRowSchema>;

/**
 * plan row (pk=user#<id>, sk=plan#<weekStart>) の parse 用。
 *
 * WeeklyPlan の契約 JSON Schema はまだ存在しないため、
 * 最低限の shape (meals 配列が存在するか、任意の追加 field)
 * だけを保証する。契約が固まったら置き換える。
 */
export const WeeklyPlanRowSchema = z
	.object({
		meals: z.array(z.unknown()).optional(),
	})
	.catchall(z.unknown());

export type WeeklyPlanRow = z.infer<typeof WeeklyPlanRowSchema>;

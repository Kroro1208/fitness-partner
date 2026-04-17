import { UserProfileSchema } from "@fitness/contracts-ts";
import { z } from "zod";

/**
 * DynamoDB row → Domain Mapper のための Zod schema。
 *
 * Parse 境界: handler が GetCommand で取得した Item は untrusted。
 * ここで parse することで、レスポンス組み立てコードが `unknown` を
 * 介さず型付きデータで進めるようにする。
 *
 * 注意: DynamoDB 由来の pk/sk は本スキーマでは保持しない
 * (handler が stripKeys で除去する前提)。
 */

/**
 * profile row (pk=user#<id>, sk=profile) の parse 用。
 * UserProfileSchema は全 field optional なのでそのまま利用する。
 */
export const ProfileRowSchema = UserProfileSchema;

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

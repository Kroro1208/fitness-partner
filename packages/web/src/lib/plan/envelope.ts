import { WeeklyPlanSchema } from "@fitness/contracts-ts";
import { z } from "zod";

/**
 * `GET /users/me/plans/{weekStart}` の応答封筒。
 * Client 経由 (`lib/api/plans.ts`) と Server 経由 (`lib/plan/server.ts`) の
 * 両方から参照される single source of truth。
 */
export const WeeklyPlanEnvelopeSchema = z.object({ plan: WeeklyPlanSchema });

import "server-only";

import { getValidAccessTokenServer } from "../auth/session";
import { WeeklyPlanEnvelopeSchema } from "./envelope";
import { parseWeeklyPlanToVM, type WeeklyPlanVM } from "./plan-mappers";

/**
 * Server-side fetch の失敗を呼び出し元で区別するための discriminated union。
 * Plan 07 の `getProfileServerSideResult` と同構造。
 * - missing_access_token: セッション切れ
 * - missing_api_base:     deploy 設定不備 (env var 未設定)
 * - upstream_failure:     API Gateway / Lambda の 5xx
 * - parse_failure:        応答が契約 (WeeklyPlanEnvelopeSchema) を満たさない
 */
export type GetWeeklyPlanServerSideResult =
	| { ok: true; plan: WeeklyPlanVM | null }
	| {
			ok: false;
			reason:
				| "missing_access_token"
				| "missing_api_base"
				| "upstream_failure"
				| "parse_failure";
			status?: number;
	  };

export async function getWeeklyPlanServerSideResult(
	weekStart: string,
): Promise<GetWeeklyPlanServerSideResult> {
	const token = await getValidAccessTokenServer();
	if (!token) {
		return { ok: false, reason: "missing_access_token" };
	}

	const apiBase = process.env.API_GATEWAY_URL;
	if (!apiBase) {
		return { ok: false, reason: "missing_api_base" };
	}

	const res = await fetch(
		`${apiBase.replace(/\/$/, "")}/users/me/plans/${encodeURIComponent(weekStart)}`,
		{
			headers: { Authorization: `Bearer ${token}` },
			cache: "no-store",
		},
	);

	if (res.status === 404) {
		return { ok: true, plan: null };
	}
	if (res.status !== 200) {
		return { ok: false, reason: "upstream_failure", status: res.status };
	}

	const parsed = WeeklyPlanEnvelopeSchema.safeParse(await res.json());
	if (!parsed.success) {
		return { ok: false, reason: "parse_failure" };
	}
	return { ok: true, plan: parseWeeklyPlanToVM(parsed.data.plan) };
}

/**
 * Server Component 用の WeeklyPlan 取得 (simple 形)。
 * 失敗は `console.error` に残してから `null` に畳む (観測可能なまま UI 側に
 * reactive な再 fetch を委譲する)。詳細理由が必要なら
 * `getWeeklyPlanServerSideResult` を直接呼ぶ。
 */
export async function getWeeklyPlanServerSide(
	weekStart: string,
): Promise<WeeklyPlanVM | null> {
	const result = await getWeeklyPlanServerSideResult(weekStart);
	if (!result.ok) {
		console.error("getWeeklyPlanServerSide failed", {
			reason: result.reason,
			status: result.status,
		});
		throw new Error(`getWeeklyPlanServerSide failed: ${result.reason}`);
	}
	return result.plan;
}

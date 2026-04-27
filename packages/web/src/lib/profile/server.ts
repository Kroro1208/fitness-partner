import "server-only";

import { UserProfileSchema } from "@fitness/contracts-ts";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getValidAccessTokenServer } from "../auth/session";
import { type OnboardingProfile, toOnboardingProfile } from "./profile-mappers";

const ProfileEnvelopeSchema = z
	.object({
		profile: UserProfileSchema,
	})
	.strict();

export type GetProfileServerSideResult =
	| { ok: true; profile: OnboardingProfile | null }
	| {
			ok: false;
			reason:
				| "missing_access_token"
				| "missing_api_base"
				| "upstream_failure"
				| "parse_failure";
			status?: number;
	  };

export async function getProfileServerSideResult(): Promise<GetProfileServerSideResult> {
	const token = await getValidAccessTokenServer();
	if (!token) {
		return { ok: false, reason: "missing_access_token" };
	}

	const apiBase = process.env.API_GATEWAY_URL;
	if (!apiBase) {
		return { ok: false, reason: "missing_api_base" };
	}

	const res = await fetch(`${apiBase.replace(/\/$/, "")}/users/me/profile`, {
		headers: { Authorization: `Bearer ${token}` },
		cache: "no-store",
	});

	if (res.status === 404) {
		return { ok: true, profile: null };
	}
	if (res.status !== 200) {
		return { ok: false, reason: "upstream_failure", status: res.status };
	}

	const parsed = ProfileEnvelopeSchema.safeParse(await res.json());
	if (!parsed.success) {
		return { ok: false, reason: "parse_failure" };
	}
	return { ok: true, profile: toOnboardingProfile(parsed.data.profile) };
}

/**
 * Server Component から呼ぶプロフィールロード helper。
 *
 * なぜ `getProfileServerSide` を置き換えたか:
 *   - 旧 helper は `getProfileServerSideResult` の Result を全て `throw new Error(...)`
 *     に潰していた。これにより本来 expected error (セッション切れ = 再ログイン誘導) も
 *     `error.tsx` の generic 500 画面に流れてしまっていた (skill: AP4 違反)。
 *   - 新 helper は `missing_access_token` だけ `redirect("/signin")` に分岐し、
 *     それ以外の Result.error は throw して `error.tsx` に任せる。
 *
 * - 戻り値 `OnboardingProfile`: プロフィール取得済み
 * - 戻り値 `null`: プロフィール未作成 (404、これは onboarding 開始前の正常状態)
 * - `redirect("/signin")`: セッション切れ
 * - throw: API 障害 / 契約違反 (= error.tsx に委譲)
 *
 * 注意: `redirect()` は Next.js の制御例外なので、絶対に try/catch で囲まないこと
 * (skill: AP3)。呼び出し側もこの helper を try/catch で囲んではいけない。
 */
export async function loadOnboardingProfile(): Promise<OnboardingProfile | null> {
	const result = await getProfileServerSideResult();
	if (result.ok) return result.profile;

	if (result.reason === "missing_access_token") {
		// expected error: 再ログイン誘導
		redirect("/signin");
	}

	// missing_api_base / upstream_failure / parse_failure は想定外 or 構成不備。
	// 観測のためログを残し、`error.tsx` で fallback UI を出す。
	console.error("loadOnboardingProfile failed", {
		reason: result.reason,
		status: result.status,
	});
	throw new Error(`loadOnboardingProfile failed: ${result.reason}`);
}

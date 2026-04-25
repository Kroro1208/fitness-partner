import "server-only";

import { UserProfileSchema } from "@fitness/contracts-ts";
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
 * Server Component 用のプロフィール取得。境界で snake→camel 変換し、
 * React 層には `OnboardingProfile | null` (camelCase) を返す。
 */
export async function getProfileServerSide(): Promise<OnboardingProfile | null> {
	const result = await getProfileServerSideResult();
	if (!result.ok) {
		console.error("getProfileServerSide failed", {
			reason: result.reason,
			status: result.status,
		});
		throw new Error(`getProfileServerSide failed: ${result.reason}`);
	}
	return result.profile;
}

import "server-only";

import { CognitoJwtVerifier } from "aws-jwt-verify";
import { z } from "zod";

import { getCognitoEnv } from "./cognito";

export type SessionFromIdToken = {
	userId: string;
	email: string;
};

const idTokenPayloadSchema = z.object({
	sub: z.string().min(1),
	email: z.string().email(),
});

type IdTokenVerifier = ReturnType<typeof CognitoJwtVerifier.create>;

let verifierCache:
	| {
			key: string;
			verifier: IdTokenVerifier;
	  }
	| undefined;

function getIdTokenVerifier(): IdTokenVerifier {
	const env = getCognitoEnv();
	const key = [
		env.COGNITO_REGION,
		env.COGNITO_USER_POOL_ID,
		env.COGNITO_CLIENT_ID,
	].join(":");

	if (verifierCache?.key === key) {
		return verifierCache.verifier;
	}

	const verifier = CognitoJwtVerifier.create({
		userPoolId: env.COGNITO_USER_POOL_ID,
		clientId: env.COGNITO_CLIENT_ID,
		tokenUse: "id",
	});
	verifierCache = { key, verifier };
	return verifier;
}

export async function decodeSessionFromIdToken(
	idToken: string,
): Promise<SessionFromIdToken | null> {
	if (!idToken) return null;

	try {
		const payload = await getIdTokenVerifier().verify(idToken);
		const parsed = idTokenPayloadSchema.safeParse(payload);
		if (!parsed.success) return null;
		return { userId: parsed.data.sub, email: parsed.data.email };
	} catch (error) {
		// 旧実装は空 catch で観測性ゼロだった。
		// 期限切れ (TokenExpiredException) と署名不正 (InvalidTokenException) と
		// 鍵取得 fetch 失敗 (構成バグ) を区別したいが、現状は呼び出し側が
		// null を「再ログイン誘導」として扱うため戻り値の形は維持し、
		// 観測のため warn ログだけ残す。
		// 5xx 級の問題 (鍵 fetch 失敗) も含まれうるが、rate を考慮し warn 止まり。
		console.warn("decodeSessionFromIdToken failed", {
			name: error instanceof Error ? error.name : "unknown",
			message: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

export function resetIdTokenVerifierCacheForTest(): void {
	verifierCache = undefined;
}

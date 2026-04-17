import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyMock, createMock } = vi.hoisted(() => ({
	verifyMock: vi.fn(),
	createMock: vi.fn(),
}));

vi.mock("aws-jwt-verify", () => ({
	CognitoJwtVerifier: {
		create: createMock,
	},
}));

import {
	decodeSessionFromIdToken,
	resetIdTokenVerifierCacheForTest,
} from "../jwt";

describe("decodeSessionFromIdToken", () => {
	beforeEach(() => {
		process.env.COGNITO_USER_POOL_ID = "ap-northeast-1_test";
		process.env.COGNITO_CLIENT_ID = "client-id";
		process.env.COGNITO_REGION = "ap-northeast-1";
		verifyMock.mockReset();
		createMock.mockReset();
		createMock.mockReturnValue({ verify: verifyMock });
		resetIdTokenVerifierCacheForTest();
	});

	it("検証済み id token から userId と email を取り出す", async () => {
		verifyMock.mockResolvedValueOnce({
			sub: "user-123",
			email: "taro@example.com",
		});

		await expect(decodeSessionFromIdToken("signed-token")).resolves.toEqual({
			userId: "user-123",
			email: "taro@example.com",
		});
		expect(createMock).toHaveBeenCalledWith({
			userPoolId: "ap-northeast-1_test",
			clientId: "client-id",
			tokenUse: "id",
		});
		expect(verifyMock).toHaveBeenCalledWith("signed-token");
	});

	it("空文字は検証せず null を返す", async () => {
		await expect(decodeSessionFromIdToken("")).resolves.toBeNull();
		expect(verifyMock).not.toHaveBeenCalled();
	});

	it("JWT 検証失敗時は null を返す", async () => {
		verifyMock.mockRejectedValueOnce(new Error("invalid jwt"));
		await expect(decodeSessionFromIdToken("forged-token")).resolves.toBeNull();
	});

	it("検証済みでも email が欠けていれば null を返す", async () => {
		verifyMock.mockResolvedValueOnce({ sub: "user-123" });
		await expect(decodeSessionFromIdToken("signed-token")).resolves.toBeNull();
	});

	it("同じ環境設定では verifier を再利用する", async () => {
		verifyMock.mockResolvedValue({
			sub: "user-123",
			email: "taro@example.com",
		});

		await decodeSessionFromIdToken("token-1");
		await decodeSessionFromIdToken("token-2");

		expect(createMock).toHaveBeenCalledTimes(1);
		expect(verifyMock).toHaveBeenCalledTimes(2);
	});
});

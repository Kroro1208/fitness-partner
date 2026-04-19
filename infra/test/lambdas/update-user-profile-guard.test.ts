import type { APIGatewayProxyEventV2WithJWTAuthorizer } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lambdas/shared/dynamo", () => ({
	docClient: { send: vi.fn() },
	stripKeys: (o: Record<string, unknown>) => {
		const { pk: _pk, sk: _sk, ...rest } = o;
		return rest;
	},
	TABLE_NAME: "test",
}));

function buildEvent(body: object): APIGatewayProxyEventV2WithJWTAuthorizer {
	return {
		requestContext: {
			authorizer: { jwt: { claims: { sub: "user-123" } } },
		},
		body: JSON.stringify(body),
		isBase64Encoded: false,
		headers: { "content-type": "application/json" },
	} as unknown as APIGatewayProxyEventV2WithJWTAuthorizer;
}

describe("updateUserProfile safety guard", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("rejects pregnancy=true without stage=blocked", async () => {
		const { handler } = await import("../../lambdas/update-user-profile");
		const res = await handler(
			buildEvent({ is_pregnant_or_breastfeeding: true }),
		);
		expect(res.statusCode).toBe(400);
	});

	it("rejects stage=blocked without blocked_reason", async () => {
		const { handler } = await import("../../lambdas/update-user-profile");
		const res = await handler(
			buildEvent({
				onboarding_stage: "blocked",
				is_pregnant_or_breastfeeding: true,
			}),
		);
		expect(res.statusCode).toBe(400);
	});

	it("accepts stage=blocked with blocked_reason and pregnancy=true", async () => {
		const { docClient } = await import("../../lambdas/shared/dynamo");
		(docClient.send as ReturnType<typeof vi.fn>).mockResolvedValue({
			Attributes: { pk: "user#x", sk: "profile", onboarding_stage: "blocked" },
		});
		const { handler } = await import("../../lambdas/update-user-profile");
		const res = await handler(
			buildEvent({
				onboarding_stage: "blocked",
				blocked_reason: "pregnancy_or_breastfeeding",
				is_pregnant_or_breastfeeding: true,
			}),
		);
		expect(res.statusCode).toBe(200);
	});
});

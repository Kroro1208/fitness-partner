import { describe, expect, it } from "vitest";

process.env.__VARLOCK_ENV ??= JSON.stringify({ config: {} });

const { default: nextConfig, buildSecurityHeaders } = await import(
	"../next.config"
);
const resolvedNextConfig = await nextConfig("phase-test", {
	defaultConfig: {},
});

describe("next config security hardening", () => {
	it("disables x-powered-by", () => {
		expect(resolvedNextConfig.poweredByHeader).toBe(false);
	});

	it("adds baseline security headers", () => {
		const headers = buildSecurityHeaders(false);

		expect(headers).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "Content-Security-Policy",
					value: expect.stringContaining("frame-ancestors 'none'"),
				}),
				{ key: "X-Frame-Options", value: "DENY" },
				{ key: "X-Content-Type-Options", value: "nosniff" },
				{
					key: "Referrer-Policy",
					value: "origin-when-cross-origin",
				},
			]),
		);
	});

	it("adds HSTS in production", () => {
		expect(buildSecurityHeaders(true)).toEqual(
			expect.arrayContaining([
				{
					key: "Strict-Transport-Security",
					value: "max-age=63072000; includeSubDomains; preload",
				},
			]),
		);
	});
});

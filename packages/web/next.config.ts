import type { NextConfig } from "next";

const BASE_SECURITY_HEADERS = [
	{
		key: "Content-Security-Policy",
		value: [
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'",
			"object-src 'none'",
		].join("; "),
	},
	{
		key: "X-Frame-Options",
		value: "DENY",
	},
	{
		key: "X-Content-Type-Options",
		value: "nosniff",
	},
	{
		key: "Referrer-Policy",
		value: "origin-when-cross-origin",
	},
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
	},
] as const;

export function buildSecurityHeaders(
	isProduction: boolean = process.env.NODE_ENV === "production",
) {
	if (!isProduction) {
		return [...BASE_SECURITY_HEADERS];
	}

	return [
		...BASE_SECURITY_HEADERS,
		{
			key: "Strict-Transport-Security",
			value: "max-age=63072000; includeSubDomains; preload",
		},
	];
}

const nextConfig: NextConfig = {
	poweredByHeader: false,
	transpilePackages: ["@fitness/contracts-ts"],
	async headers() {
		return [
			{
				source: "/:path*",
				headers: buildSecurityHeaders(),
			},
		];
	},
};

export default nextConfig;

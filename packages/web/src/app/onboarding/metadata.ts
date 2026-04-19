import type { Metadata } from "next";

export function createOnboardingMetadata(
	title: string,
	description: string,
): Metadata {
	return {
		title: `${title} | オンボーディング | AI Fitness Partner`,
		description,
	};
}

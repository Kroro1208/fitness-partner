import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = {
	title: "AI Fitness Partner",
	description:
		"AIと一緒に食事・運動・体重を記録し、目標達成をサポートするフィットネスパートナー",
};

export default async function RootPage() {
	const session = await getSession();
	redirect(session ? "/home" : "/signin");
}

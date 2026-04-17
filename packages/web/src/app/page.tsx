import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "AI Fitness Partner",
	description:
		"AIと一緒に食事・運動・体重を記録し、目標達成をサポートするフィットネスパートナー",
};

export default async function RootPage() {
	const cookieStore = await cookies();
	const hasSession = cookieStore.has("__fitness_id");
	redirect(hasSession ? "/home" : "/signin");
}

import { redirect } from "next/navigation";

import { AppShell } from "@/components/domain/app-shell";
import { getSession } from "@/lib/auth/session";

export default async function AppLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (!session) {
		redirect("/signin");
	}

	return <AppShell>{children}</AppShell>;
}

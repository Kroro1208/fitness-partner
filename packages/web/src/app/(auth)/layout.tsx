import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";

export default async function AuthLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await getSession();
	if (session) {
		redirect("/home");
	}

	return (
		<div className="min-h-dvh bg-bg-canvas flex items-center justify-center px-4 py-10">
			<div className="w-full max-w-md">{children}</div>
		</div>
	);
}

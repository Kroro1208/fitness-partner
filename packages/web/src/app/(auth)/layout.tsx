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
		<div className="flex min-h-dvh items-center justify-center bg-bg-canvas px-4 py-10 sm:px-6 sm:py-12">
			<div className="w-full max-w-md">{children}</div>
		</div>
	);
}

import type { Metadata } from "next";

import { Providers } from "@/components/providers";

import "./globals.css";

export const metadata: Metadata = {
	title: "AI Fitness Partner",
	description: "あなた専属の AI フィットネスパートナー",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="ja">
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}

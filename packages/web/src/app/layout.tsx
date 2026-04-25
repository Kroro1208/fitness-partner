import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_JP } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

const notoSansJp = Noto_Sans_JP({
	subsets: ["latin"],
	weight: ["400", "500", "600", "700"],
	variable: "--font-noto-sans-jp",
	display: "swap",
});

const geistMono = Geist_Mono({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-geist-mono",
	display: "swap",
});

export const metadata: Metadata = {
	title: "AI Fitness Partner",
	description: "あなた専属の AI フィットネスパートナー",
};

export const viewport: Viewport = {
	themeColor: "#f7f8f5",
	width: "device-width",
	initialScale: 1,
	viewportFit: "cover",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="ja" className={`${notoSansJp.variable} ${geistMono.variable}`}>
			<body className="font-sans antialiased">
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}

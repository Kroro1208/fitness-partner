import { AppShell } from "@/components/domain/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
	return <AppShell>{children}</AppShell>;
}

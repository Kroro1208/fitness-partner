import { NextResponse } from "next/server";

import { clearSession } from "@/lib/auth/session";
import { enforceSameOrigin } from "@/lib/security/request-guard";

export async function POST(request: Request) {
	const origin = enforceSameOrigin(request);
	if (!origin.ok) return origin.response;

	await clearSession();
	return NextResponse.json({ success: true });
}

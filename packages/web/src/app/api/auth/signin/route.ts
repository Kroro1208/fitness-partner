import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoSignIn } from "@/lib/auth/cognito";
import { handleAuthError } from "@/lib/auth/errors";
import { setSession } from "@/lib/auth/session";

const bodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export async function POST(request: NextRequest) {
	try {
		const json = await request.json();
		const { email, password } = bodySchema.parse(json);
		const tokens = await cognitoSignIn(email, password);
		await setSession(tokens);
		return NextResponse.json({ success: true });
	} catch (error) {
		return handleAuthError(error);
	}
}

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoSignUp } from "@/lib/auth/cognito";
import { handleAuthError } from "@/lib/auth/errors";

const bodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	inviteCode: z.string().min(1),
});

export async function POST(request: NextRequest) {
	try {
		const json = await request.json();
		const { email, password, inviteCode } = bodySchema.parse(json);
		await cognitoSignUp(email, password, inviteCode);
		return NextResponse.json({ needsConfirmation: true });
	} catch (error) {
		return handleAuthError(error);
	}
}

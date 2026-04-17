import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { cognitoConfirmSignUp } from "@/lib/auth/cognito";
import { handleAuthError } from "@/lib/auth/errors";

const bodySchema = z.object({
	email: z.string().email(),
	code: z.string().min(1),
});

export async function POST(request: NextRequest) {
	try {
		const json = await request.json();
		const { email, code } = bodySchema.parse(json);
		await cognitoConfirmSignUp(email, code);
		return NextResponse.json({ success: true });
	} catch (error) {
		return handleAuthError(error);
	}
}

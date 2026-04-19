import { type NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
	const headers = new Headers(request.headers);
	headers.set("x-next-pathname", request.nextUrl.pathname);
	return NextResponse.next({ request: { headers } });
}

export const config = {
	matcher: ["/((?!api|_next|favicon.ico|.*\\.).*)"],
};

import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PATHS = ["/home", "/plan", "/chat", "/progress", "/profile"];
const AUTH_PATHS = ["/signin", "/signup"];

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;
	const hasSession = request.cookies.has("__fitness_id");

	const isProtected = PROTECTED_PATHS.some(
		(p) => pathname === p || pathname.startsWith(`${p}/`),
	);
	const isAuth = AUTH_PATHS.some(
		(p) => pathname === p || pathname.startsWith(`${p}/`),
	);

	if (!hasSession && isProtected) {
		const url = request.nextUrl.clone();
		url.pathname = "/signin";
		return NextResponse.redirect(url);
	}

	if (hasSession && isAuth) {
		const url = request.nextUrl.clone();
		url.pathname = "/home";
		return NextResponse.redirect(url);
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api|_next|favicon.ico|.*\\.).*)"],
};

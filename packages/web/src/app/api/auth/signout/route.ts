import { NextResponse } from "next/server";

import { clearSession } from "@/lib/auth/session";
import { enforceSameOrigin } from "@/lib/security/request-guard";
import { withRouteErrorHandling } from "@/shared/http/with-route-error-handling";

// signout は単純な cookie 削除のみだが、`enforceSameOrigin` の throw を
// wrapper で 403 に変換するためにも wrapper 経由で書く (整合性確保)。

export const POST = withRouteErrorHandling(async (request: Request) => {
	enforceSameOrigin(request);
	await clearSession();
	return NextResponse.json({ success: true });
});

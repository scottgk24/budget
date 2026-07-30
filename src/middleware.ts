import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEMO_COOKIE, DEMO_COOKIE_VALUE } from "@/lib/demo";
import { isClerkConfigured } from "@/lib/env";

const isPublicRoute = createRouteMatcher([
  "/",
  "/brand(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/plaid/webhook(.*)",
  "/api/demo",
  "/invite(.*)",
  "/setup(.*)",
  "/demo(.*)",
]);

function hasDemoCookie(req: NextRequest) {
  return req.cookies.get(DEMO_COOKIE)?.value === DEMO_COOKIE_VALUE;
}

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }
  // Demo session may call the same /api/* handlers as signed-in users.
  if (hasDemoCookie(req) && req.nextUrl.pathname.startsWith("/api/")) {
    return;
  }
  await auth.protect();
});

export default function middleware(req: NextRequest, event: Parameters<typeof clerkHandler>[1]) {
  if (!isClerkConfigured()) {
    const path = req.nextUrl.pathname;
    const allowed =
      path === "/" ||
      path === "/setup" ||
      path.startsWith("/brand") ||
      path.startsWith("/demo") ||
      path.startsWith("/api/") ||
      path.startsWith("/_next") ||
      path.startsWith("/favicon");
    if (!allowed) {
      return NextResponse.redirect(new URL("/setup", req.url));
    }
    // Without Clerk, only demo entry + cookie-gated APIs should run.
    if (
      path.startsWith("/api/") &&
      !path.startsWith("/api/plaid/webhook") &&
      path !== "/api/demo" &&
      !hasDemoCookie(req)
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }
  return clerkHandler(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};

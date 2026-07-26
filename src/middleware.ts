import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/env";

const isPublicRoute = createRouteMatcher([
  "/",
  "/brand(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/plaid/webhook(.*)",
  "/invite(.*)",
  "/setup(.*)",
]);

const clerkHandler = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export default function middleware(req: NextRequest, event: Parameters<typeof clerkHandler>[1]) {
  if (!isClerkConfigured()) {
    const path = req.nextUrl.pathname;
    const allowed =
      path === "/" ||
      path === "/setup" ||
      path.startsWith("/brand") ||
      path.startsWith("/_next") ||
      path.startsWith("/favicon");
    if (!allowed) {
      return NextResponse.redirect(new URL("/setup", req.url));
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

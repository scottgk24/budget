import { NextResponse } from "next/server";
import {
  DEMO_COOKIE,
  DEMO_COOKIE_VALUE,
  demoCookieOptions,
  ensureDemoWorkspace,
} from "@/lib/demo";
import { handleApiError } from "@/lib/api-response";

/** Enter the public demo: seed data, set cookie, redirect into the app. */
export async function GET(req: Request) {
  try {
    await ensureDemoWorkspace({ forceRefresh: false });
    const url = new URL(req.url);
    const dest = new URL("/demo/dashboard", url.origin);
    const res = NextResponse.redirect(dest);
    res.cookies.set(DEMO_COOKIE, DEMO_COOKIE_VALUE, demoCookieOptions());
    return res;
  } catch (err) {
    return handleApiError(err, "Failed to start demo");
  }
}

/** Leave the demo and clear the session cookie. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(DEMO_COOKIE, "", { ...demoCookieOptions(0), maxAge: 0 });
  return res;
}

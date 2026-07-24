import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";

/** Map known errors; never echo raw upstream messages to the client. */
export function handleApiError(err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  console.error(fallback, err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export function rateLimitedResponse(retryAfter: number) {
  return NextResponse.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

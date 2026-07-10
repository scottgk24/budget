import Link from "next/link";
import { redirect } from "next/navigation";
import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/env";

export default async function HomePage() {
  if (!isClerkConfigured()) {
    redirect("/setup");
  }

  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--bg)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #dcefe5 0%, transparent 45%), radial-gradient(circle at 80% 10%, #e8dfd0 0%, transparent 40%), linear-gradient(180deg, #f3f0ea 0%, #e7efe9 100%)",
        }}
      />

      <header className="relative mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link
          href="/"
          className="font-[family-name:var(--font-display)] text-xl tracking-tight"
        >
          Budget
        </Link>
        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--fg)]"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Sign up
              </button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <main className="relative mx-auto flex max-w-3xl flex-col justify-center px-6 pb-16 pt-10">
        <p className="font-[family-name:var(--font-display)] text-5xl tracking-tight text-[var(--fg)] sm:text-6xl">
          Budget
        </p>
        <h1 className="mt-6 max-w-xl text-2xl leading-snug text-[var(--fg)] sm:text-3xl">
          Household and sole-proprietorship money in one private place.
        </h1>
        <p className="mt-4 max-w-lg text-[var(--muted)]">
          Securely connect Chase and Robinhood, track spending across Personal and
          Business views, and keep the family on the same page.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
              >
                Create account
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-2.5 text-sm font-medium text-[var(--fg)]"
              >
                Sign in
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
            >
              Open dashboard
            </Link>
          </Show>
        </div>
        <p className="mt-8 text-sm text-[var(--muted)]">
          Invite-only. Bank credentials stay with Plaid — we never see your passwords.
        </p>
      </main>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  SignInButton,
  SignUpButton,
  Show,
  UserButton,
} from "@clerk/nextjs";
import { BrandMark } from "@/components/brand-mark";
import { LandingProductPreview } from "@/components/landing-mockups";
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
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(ellipse 70% 55% at 12% 18%, color-mix(in srgb, var(--hunter) 42%, transparent), transparent 62%)",
            "radial-gradient(ellipse 55% 45% at 92% 12%, color-mix(in srgb, var(--gold) 16%, transparent), transparent 55%)",
            "radial-gradient(ellipse 60% 50% at 78% 88%, color-mix(in srgb, var(--olive) 28%, transparent), transparent 58%)",
            "linear-gradient(180deg, transparent 55%, color-mix(in srgb, var(--bg) 90%, var(--hunter)) 100%)",
          ].join(", "),
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <BrandMark variant="mark" href="/" />
        <div className="flex items-center gap-2">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--fg)]"
              >
                Sign in
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button
                type="button"
                className="rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-sm font-medium text-[var(--on-accent)] transition hover:opacity-90"
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

      <main className="relative z-10 mx-auto grid min-h-[calc(100svh-4.5rem)] max-w-6xl items-center gap-8 px-6 pb-16 pt-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-6 lg:pb-20 lg:pt-0">
        <div className="order-2 max-w-xl lg:order-1">
          <h1 className="sage-rise font-display text-[2.35rem] font-medium leading-[1.12] tracking-tight text-[var(--fg)] sm:text-5xl lg:text-[3.4rem]">
            Household and business money, privately.
          </h1>
          <p className="sage-rise sage-rise-delay-1 mt-5 max-w-md text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            Connect your accounts, track spending across Personal and Business
            views, and keep collaborators on the same page.
          </p>
          <div className="sage-rise sage-rise-delay-2 mt-10 flex flex-wrap gap-3">
            <Show when="signed-out">
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[var(--on-accent)] transition hover:opacity-90"
                >
                  Create account
                </button>
              </SignUpButton>
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-6 py-3 text-sm font-medium text-[var(--fg)] backdrop-blur-sm transition hover:border-[var(--gold)]"
                >
                  Sign in
                </button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Link
                href="/dashboard"
                className="rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[var(--on-accent)] transition hover:opacity-90"
              >
                Open dashboard
              </Link>
            </Show>
          </div>
          <p className="sage-rise sage-rise-delay-3 mt-8 text-sm text-[var(--muted)]">
            Invite-only. Bank credentials stay with Plaid — we never see your
            passwords.
          </p>
        </div>

        <div className="relative order-1 flex items-center justify-center lg:order-2 lg:justify-end">
          <div
            aria-hidden
            className="sage-glow absolute h-[78%] w-[78%] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--gold)_24%,transparent)_0%,color-mix(in_srgb,var(--hunter)_32%,transparent)_42%,transparent_70%)] blur-2xl"
          />
          <div className="sage-rise sage-rise-delay-1 sage-drift relative w-full max-w-[260px] sm:max-w-[360px] lg:max-w-[440px]">
            <BrandMark
              variant="hero"
              href={null}
              priority
              className="mx-auto max-w-none drop-shadow-[0_28px_56px_rgb(0_0_0_/_50%)]"
            />
          </div>
        </div>
      </main>

      <LandingProductPreview />

      <section className="relative z-10 border-t border-[color-mix(in_srgb,var(--border)_70%,transparent)]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 sm:grid-cols-3 sm:gap-8 sm:py-16">
          {[
            {
              title: "Two ledgers",
              body: "Personal and Business views so household and sole-prop money stay clear.",
            },
            {
              title: "Shared quietly",
              body: "Invite collaborators into one workspace without spreading bank logins around.",
            },
            {
              title: "Private by design",
              body: "Plaid holds credentials. SAGE only sees the transactions you sync.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h2 className="font-display text-xl font-medium tracking-tight text-[var(--fg)]">
                {item.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

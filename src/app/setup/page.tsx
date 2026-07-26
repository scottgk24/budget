import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { isClerkConfigured } from "@/lib/env";

export default function SetupPage() {
  const clerkReady = isClerkConfigured();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <BrandMark variant="hero" href={null} className="max-w-[140px]" />
      <h1 className="mt-8 font-display text-2xl font-medium tracking-tight">
        Finish local setup
      </h1>
      <p className="mt-2 text-[var(--muted)]">
        The app is running, but auth keys are missing. Add Clerk keys so you can
        sign in, then optionally add Plaid for bank connections.
      </p>

      <ol className="mt-8 list-decimal space-y-6 pl-5 text-sm leading-relaxed">
        <li>
          <p className="font-medium">Create a Clerk application</p>
          <p className="text-[var(--muted)]">
            Go to{" "}
            <a
              className="text-[var(--accent)] underline"
              href="https://dashboard.clerk.com"
              target="_blank"
              rel="noreferrer"
            >
              dashboard.clerk.com
            </a>
            , create an app, and copy the <strong>Publishable key</strong> and{" "}
            <strong>Secret key</strong>.
          </p>
        </li>
        <li>
          <p className="font-medium">Paste them into <code>.env.local</code></p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
{`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...`}
          </pre>
          <p className="mt-2 text-[var(--muted)]">
            Status:{" "}
            {clerkReady ? (
              <span className="text-[var(--positive)]">Clerk keys look valid</span>
            ) : (
              <span className="text-[var(--danger)]">Clerk keys not set yet</span>
            )}
          </p>
        </li>
        <li>
          <p className="font-medium">Restart the dev server</p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
{`# stop npm run dev (Ctrl+C), then:
npm run dev`}
          </pre>
        </li>
        <li>
          <p className="font-medium">(Later) Add Plaid sandbox keys</p>
          <p className="text-[var(--muted)]">
            From{" "}
            <a
              className="text-[var(--accent)] underline"
              href="https://dashboard.plaid.com"
              target="_blank"
              rel="noreferrer"
            >
              dashboard.plaid.com
            </a>
            , set <code>PLAID_CLIENT_ID</code> and <code>PLAID_SECRET</code> to
            connect Chase / Robinhood.
          </p>
        </li>
      </ol>

      <div className="mt-10 flex gap-3">
        <Link
          href="/"
          className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

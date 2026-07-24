import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { Card } from "@/components/ui";

export default async function NotAllowedPage() {
  const user = await currentUser();
  const email =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ??
    user?.emailAddresses[0]?.emailAddress;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #dcefe5 0%, transparent 45%), radial-gradient(circle at 80% 10%, #e8dfd0 0%, transparent 40%), linear-gradient(180deg, #f3f0ea 0%, #e7efe9 100%)",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-[family-name:var(--font-display)] text-xl tracking-tight"
          >
            Budget
          </Link>
          <UserButton />
        </div>

        <Card>
          <h1 className="font-[family-name:var(--font-display)] text-2xl tracking-tight">
            Invite only
          </h1>
          <p className="mt-3 text-[var(--muted)]">
            This app is invite-only. Ask a family member who already has access to
            send you an invite.
          </p>
          {email ? (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Signed in as{" "}
              <span className="font-medium text-[var(--fg)]">{email}</span>
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2 text-sm font-medium text-[var(--fg)] hover:bg-[var(--surface)]"
            >
              Back home
            </Link>
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Use the account menu above to sign out, then sign in with an invited
            email if you have one.
          </p>
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { workspace: true },
  });

  if (!invite || invite.status === "revoked") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="max-w-md text-center">
          <h1 className="font-[family-name:var(--font-display)] text-2xl">
            Invite not found
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            This invite link is invalid or has been revoked.
          </p>
          <Link href="/" className="mt-6 inline-block text-[var(--accent)]">
            Go home
          </Link>
        </div>
      </div>
    );
  }

  if (invite.expiresAt < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
        <div className="max-w-md text-center">
          <h1 className="font-[family-name:var(--font-display)] text-2xl">
            Invite expired
          </h1>
          <p className="mt-2 text-[var(--muted)]">
            Ask a family member to send a new invite.
          </p>
        </div>
      </div>
    );
  }

  const { userId } = await auth();
  if (userId) {
    // Signed in — membership is accepted in ensureUserAndWorkspace via pending invite email match
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]">
        <p className="font-[family-name:var(--font-display)] text-3xl">Budget</p>
        <h1 className="mt-4 text-xl">You&apos;re invited to {invite.workspace.name}</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sign in or create an account with <strong>{invite.email}</strong> to join.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/sign-in"
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { acceptInviteByToken, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";

function InviteMessage({
  title,
  description,
  href = "/",
  linkLabel = "Go home",
}: {
  title: string;
  description: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <BrandMark variant="mark" href="/" className="h-16 w-auto" />
        </div>
        <h1 className="font-display text-2xl font-medium tracking-tight">
          {title}
        </h1>
        <p className="mt-2 text-[var(--muted)]">{description}</p>
        <Link href={href} className="mt-6 inline-block text-[var(--accent)]">
          {linkLabel}
        </Link>
      </div>
    </div>
  );
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.invite.findUnique({
    where: { token },
  });

  if (!invite || invite.status === "revoked") {
    return (
      <InviteMessage
        title="Invite not found"
        description="This invite link is invalid or has been revoked."
      />
    );
  }

  if (invite.status === "expired" || invite.expiresAt < new Date()) {
    if (invite.status === "pending") {
      await prisma.invite.update({
        where: { id: invite.id },
        data: { status: "expired" },
      });
    }
    return (
      <InviteMessage
        title="Invite expired"
        description="Ask a workspace member to send a new invite."
      />
    );
  }

  if (invite.status === "accepted") {
    const { userId } = await auth();
    if (userId) redirect("/dashboard");
    return (
      <InviteMessage
        title="Invite already used"
        description="Sign in with the account that accepted this invite."
        href="/sign-in"
        linkLabel="Sign in"
      />
    );
  }

  if (invite.status !== "pending") {
    return (
      <InviteMessage
        title="Invite not found"
        description="This invite link is invalid or has been revoked."
      />
    );
  }

  const { userId } = await auth();
  if (userId) {
    const clerkUser = await currentUser();
    const email =
      clerkUser?.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
        ?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress;

    if (!email || !clerkUser) {
      redirect("/sign-in");
    }

    try {
      let user = await prisma.user.findUnique({ where: { clerkId: userId } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            clerkId: userId,
            email: email.toLowerCase(),
            name: email,
          },
        });
      }

      const existing = await prisma.membership.findFirst({
        where: { userId: user.id },
      });
      if (!existing) {
        await acceptInviteByToken(user.id, email, token);
      } else {
        // Already in a workspace — mark invite accepted if email matches this token.
        try {
          await acceptInviteByToken(user.id, email, token);
        } catch {
          /* ignore mismatch / already used when already a member */
        }
      }
    } catch (err) {
      if (err instanceof AuthError) {
        return (
          <InviteMessage
            title="Could not accept invite"
            description={err.message}
            href="/dashboard"
            linkLabel="Go to dashboard"
          />
        );
      }
      throw err;
    }

    redirect("/dashboard");
  }

  const redirectTo = encodeURIComponent(`/invite/${token}`);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-[var(--shadow)]">
        <div className="flex justify-center">
          <BrandMark variant="hero" href={null} className="max-w-[140px]" />
        </div>
        <h1 className="mt-6 font-display text-xl font-medium tracking-tight">
          You&apos;re invited
        </h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sign in or create an account with the email address this invite was sent to.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href={`/sign-in?redirect_url=${redirectTo}`}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]"
          >
            Sign in
          </Link>
          <Link
            href={`/sign-up?redirect_url=${redirectTo}`}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:border-[var(--gold)]"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}

import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { defaultCategoriesForLedger } from "@/lib/categories";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function parseAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAllowed(email: string): boolean {
  const allowed = parseAllowedEmails();
  // Empty allowlist = open to any authenticated user (local/dev convenience).
  // In production, set ALLOWED_EMAILS or rely on invite tokens.
  if (allowed.length === 0) return true;
  return allowed.includes(email.toLowerCase());
}

export async function requireAuth() {
  const session = await auth();
  if (!session.userId) {
    throw new AuthError("Unauthorized", 401);
  }
  return session;
}

/** Ensure a DB user + default workspace exist for the signed-in Clerk user. */
export async function ensureUserAndWorkspace() {
  const session = await requireAuth();
  const clerkUser = await currentUser();
  if (!clerkUser) {
    throw new AuthError("Unauthorized", 401);
  }

  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;

  if (!email) {
    throw new AuthError("No email on account", 400);
  }

  if (!isEmailAllowed(email)) {
    // Still allow if they have a pending/accepted invite
    const invite = await prisma.invite.findFirst({
      where: {
        email: email.toLowerCase(),
        status: { in: ["pending", "accepted"] },
      },
    });
    if (!invite) {
      throw new AuthError(
        "This app is invite-only. Ask a family member to invite you.",
        403,
      );
    }
  }

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    email;

  let user = await prisma.user.findUnique({ where: { clerkId: session.userId } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: session.userId,
        email: email.toLowerCase(),
        name,
      },
    });
  } else if (user.email !== email.toLowerCase() || user.name !== name) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { email: email.toLowerCase(), name },
    });
  }

  let membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

  if (!membership) {
    // Accept pending invite if one exists
    const pendingInvite = await prisma.invite.findFirst({
      where: { email: email.toLowerCase(), status: "pending" },
      orderBy: { createdAt: "desc" },
    });

    if (pendingInvite) {
      membership = await prisma.membership.create({
        data: {
          userId: user.id,
          workspaceId: pendingInvite.workspaceId,
          role: "member",
        },
        include: { workspace: true },
      });
      await prisma.invite.update({
        where: { id: pendingInvite.id },
        data: { status: "accepted" },
      });
    } else {
      const workspace = await prisma.workspace.create({
        data: {
          name: "Family",
          memberships: {
            create: { userId: user.id, role: "owner" },
          },
        },
      });
      await seedDefaultCategories(workspace.id);
      membership = await prisma.membership.findFirstOrThrow({
        where: { userId: user.id, workspaceId: workspace.id },
        include: { workspace: true },
      });
    }
  }

  return { user, membership, workspace: membership.workspace };
}

export async function getWorkspaceContext() {
  return ensureUserAndWorkspace();
}

export async function seedDefaultCategories(workspaceId: string) {
  const existing = await prisma.category.count({ where: { workspaceId } });
  if (existing > 0) return;

  const personal = defaultCategoriesForLedger("personal").map((name) => ({
    workspaceId,
    name,
    ledger: "personal" as const,
    isDefault: true,
  }));
  const business = defaultCategoriesForLedger("business").map((name) => ({
    workspaceId,
    name,
    ledger: "business" as const,
    isDefault: true,
  }));

  await prisma.category.createMany({ data: [...personal, ...business] });
}

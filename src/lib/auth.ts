import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { defaultCategoriesForLedger } from "@/lib/categories";
import { reclassifyUnlockedTransactions } from "@/lib/categorize";
import { isProductionRuntime } from "@/lib/runtime";

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

/**
 * Explicit allowlist membership.
 * Empty allowlist is open only outside production (local/dev convenience).
 * In production, empty allowlist means nobody is allowlisted — join via invite only.
 */
export function isEmailAllowed(email: string): boolean {
  const allowed = parseAllowedEmails();
  if (allowed.length === 0) {
    return !isProductionRuntime();
  }
  return allowed.includes(email.toLowerCase());
}

export async function requireAuth() {
  const session = await auth();
  if (!session.userId) {
    throw new AuthError("Unauthorized", 401);
  }
  return session;
}

async function expireStaleInvites(email?: string) {
  await prisma.invite.updateMany({
    where: {
      status: "pending",
      expiresAt: { lt: new Date() },
      ...(email ? { email: email.toLowerCase() } : {}),
    },
    data: { status: "expired" },
  });
}

/** Accept a pending, non-expired invite by token for the given user (email must match). */
export async function acceptInviteByToken(
  userId: string,
  email: string,
  token: string,
) {
  await expireStaleInvites(email);

  const invite = await prisma.invite.findUnique({
    where: { token },
  });

  if (!invite || invite.status === "revoked" || invite.status === "expired") {
    throw new AuthError("Invite not found or no longer valid", 404);
  }
  if (invite.status !== "pending") {
    throw new AuthError("Invite has already been used", 400);
  }
  if (invite.expiresAt < new Date()) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "expired" },
    });
    throw new AuthError("Invite expired", 410);
  }
  if (invite.email.toLowerCase() !== email.toLowerCase()) {
    throw new AuthError(
      "Sign in with the email address this invite was sent to",
      403,
    );
  }

  const existing = await prisma.membership.findFirst({
    where: { userId, workspaceId: invite.workspaceId },
    include: { workspace: true },
  });
  if (existing) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    });
    return existing;
  }

  const membership = await prisma.membership.create({
    data: {
      userId,
      workspaceId: invite.workspaceId,
      role: "member",
    },
    include: { workspace: true },
  });
  await prisma.invite.update({
    where: { id: invite.id },
    data: { status: "accepted" },
  });
  return membership;
}

/** Ensure a DB user + default workspace exist for the signed-in Clerk user. */
export async function ensureUserAndWorkspace(options?: { inviteToken?: string }) {
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

  // Existing members always pass (allowlist/invite only gate new joiners).
  let membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });
  if (membership) {
    // Backfill any newly added default categories (idempotent).
    const added = await seedDefaultCategories(membership.workspaceId);
    if (added > 0) {
      await reclassifyUnlockedTransactions(membership.workspaceId);
    }
    return { user, membership, workspace: membership.workspace };
  }

  await expireStaleInvites(email);

  // Prefer explicit invite token (binds acceptance to the link that was opened).
  if (options?.inviteToken) {
    membership = await acceptInviteByToken(user.id, email, options.inviteToken);
    return { user, membership, workspace: membership.workspace };
  }

  // Email-matched pending invite (non-expired only).
  const pendingInvite = await prisma.invite.findFirst({
    where: {
      email: email.toLowerCase(),
      status: "pending",
      expiresAt: { gt: new Date() },
    },
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
    return { user, membership, workspace: membership.workspace };
  }

  // New workspace: allowlisted emails only (open allowlist only in non-production).
  if (!isEmailAllowed(email)) {
    throw new AuthError(
      "This app is invite-only. Ask a family member to invite you.",
      403,
    );
  }

  if (isProductionRuntime() && parseAllowedEmails().length === 0) {
    throw new AuthError(
      "This app is invite-only. Ask a family member to invite you.",
      403,
    );
  }

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

  return { user, membership, workspace: membership.workspace };
}

export async function getWorkspaceContext() {
  return ensureUserAndWorkspace();
}

/** Insert missing default categories. Returns how many rows were created. */
export async function seedDefaultCategories(workspaceId: string): Promise<number> {
  const desired = [
    ...defaultCategoriesForLedger("personal").map((name) => ({
      workspaceId,
      name,
      ledger: "personal" as const,
      isDefault: true,
    })),
    ...defaultCategoriesForLedger("business").map((name) => ({
      workspaceId,
      name,
      ledger: "business" as const,
      isDefault: true,
    })),
  ];

  const existing = await prisma.category.findMany({
    where: { workspaceId },
    select: { name: true, ledger: true },
  });
  const have = new Set(existing.map((c) => `${c.ledger}:${c.name}`));
  const missing = desired.filter((c) => !have.has(`${c.ledger}:${c.name}`));
  if (missing.length === 0) return 0;

  const result = await prisma.category.createMany({ data: missing });
  return result.count;
}

export function requireOwner(role: string) {
  if (role !== "owner") {
    throw new AuthError("Only workspace owners can do that", 403);
  }
}

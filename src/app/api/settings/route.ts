import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { ensureUserAndWorkspace } from "@/lib/auth";
import { handleApiError, rateLimitedResponse } from "@/lib/api-response";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    const { workspace, membership } = await ensureUserAndWorkspace();

    const members = await prisma.membership.findMany({
      where: { workspaceId: workspace.id },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const invites = await prisma.invite.findMany({
      where: { workspaceId: workspace.id, status: "pending" },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      workspace: { id: workspace.id, name: workspace.name },
      role: membership.role,
      members: members.map((m) => ({
        id: m.id,
        role: m.role,
        user: m.user,
      })),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        token: membership.role === "owner" ? i.token : undefined,
      })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to load settings");
  }
}

const inviteSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const limited = rateLimit(`invite-create:${clientIp(req)}`, 10, 60_000);
    if (!limited.ok) return rateLimitedResponse(limited.retryAfter);

    const { user, workspace, membership } = await ensureUserAndWorkspace();
    if (membership.role !== "owner") {
      return NextResponse.json({ error: "Only owners can invite members" }, { status: 403 });
    }

    const body = inviteSchema.parse(await req.json());
    const email = body.email.toLowerCase();

    const existingMember = await prisma.membership.findFirst({
      where: { workspaceId: workspace.id, user: { email } },
    });
    if (existingMember) {
      return NextResponse.json({ error: "User is already a member" }, { status: 400 });
    }

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    const existingInvite = await prisma.invite.findFirst({
      where: { workspaceId: workspace.id, email, status: "pending" },
    });

    const invite = existingInvite
      ? await prisma.invite.update({
          where: { id: existingInvite.id },
          data: { token, expiresAt, status: "pending" },
        })
      : await prisma.invite.create({
          data: {
            workspaceId: workspace.id,
            email,
            token,
            invitedById: user.id,
            expiresAt,
            status: "pending",
          },
        });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return NextResponse.json({
      invite: {
        id: invite.id,
        email: invite.email,
        expiresAt: invite.expiresAt,
        link: `${appUrl}/invite/${invite.token}`,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to create invite");
  }
}

const revokeSchema = z.object({
  inviteId: z.string(),
});

export async function DELETE(req: Request) {
  try {
    const { workspace, membership } = await ensureUserAndWorkspace();
    if (membership.role !== "owner") {
      return NextResponse.json({ error: "Only owners can revoke invites" }, { status: 403 });
    }
    const body = revokeSchema.parse(await req.json());
    await prisma.invite.updateMany({
      where: { id: body.inviteId, workspaceId: workspace.id },
      data: { status: "revoked" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err, "Failed to revoke invite");
  }
}

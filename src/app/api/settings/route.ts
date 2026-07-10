import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

const inviteSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
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
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("invite", err);
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
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
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }
}

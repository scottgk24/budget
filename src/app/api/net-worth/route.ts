import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  accountFieldsForManualKind,
  buildNetWorthView,
  captureNetWorthSnapshots,
  MANUAL_KINDS,
} from "@/lib/net-worth";
import type { Ledger } from "@/lib/types";
import { ledgerSlugSchema } from "@/lib/workspace-ledgers";

const createSchema = z.object({
  ledger: ledgerSlugSchema,
  name: z.string().trim().min(1).max(80),
  kind: z.enum(MANUAL_KINDS),
  currentBalance: z.number().finite(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  currentBalance: z.number().finite().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as Ledger) || "personal";
    await captureNetWorthSnapshots(workspace.id);
    const view = await buildNetWorthView({ workspaceId: workspace.id, ledger });
    return NextResponse.json({ ledger, view });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("net-worth GET", err);
    return NextResponse.json({ error: "Failed to load net worth" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = createSchema.parse(await req.json());
    const { type, subtype } = accountFieldsForManualKind(body.kind);
    const account = await prisma.account.create({
      data: {
        workspaceId: workspace.id,
        name: body.name,
        type,
        subtype,
        ledger: body.ledger,
        currentBalance: Math.abs(body.currentBalance),
      },
    });
    await captureNetWorthSnapshots(workspace.id);
    const view = await buildNetWorthView({
      workspaceId: workspace.id,
      ledger: body.ledger,
    });
    return NextResponse.json({ account, view });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("net-worth POST", err);
    return NextResponse.json({ error: "Failed to add account" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = updateSchema.parse(await req.json());
    const existing = await prisma.account.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.plaidItemId) {
      return NextResponse.json(
        { error: "Linked accounts update from the bank, not here." },
        { status: 400 },
      );
    }
    const account = await prisma.account.update({
      where: { id: existing.id },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.currentBalance != null
          ? { currentBalance: Math.abs(body.currentBalance) }
          : {}),
      },
    });
    await captureNetWorthSnapshots(workspace.id);
    const view = await buildNetWorthView({
      workspaceId: workspace.id,
      ledger: existing.ledger as Ledger,
    });
    return NextResponse.json({ account, view });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("net-worth PATCH", err);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = deleteSchema.parse(await req.json());
    const existing = await prisma.account.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (existing.plaidItemId) {
      return NextResponse.json(
        { error: "Disconnect the institution on Accounts instead." },
        { status: 400 },
      );
    }
    await prisma.account.delete({ where: { id: existing.id } });
    await captureNetWorthSnapshots(workspace.id);
    const view = await buildNetWorthView({
      workspaceId: workspace.id,
      ledger: existing.ledger as Ledger,
    });
    return NextResponse.json({ ok: true, view });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("net-worth DELETE", err);
    return NextResponse.json({ error: "Failed to remove account" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Ledger } from "@/lib/types";
import { ledgerSlugSchema } from "@/lib/workspace-ledgers";

const createSchema = z.object({
  ledger: ledgerSlugSchema,
  name: z.string().trim().min(1).max(80),
  targetAmount: z.number().positive(),
  currentAmount: z.number().min(0).optional(),
  targetDate: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80).optional(),
  targetAmount: z.number().positive().optional(),
  currentAmount: z.number().min(0).optional(),
  targetDate: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as Ledger) || "personal";

    const goals = await prisma.goal.findMany({
      where: { workspaceId: workspace.id, ledger },
      orderBy: [{ targetDate: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ ledger, goals });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("goals GET", err);
    return NextResponse.json({ error: "Failed to load goals" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = createSchema.parse(await req.json());

    const goal = await prisma.goal.create({
      data: {
        workspaceId: workspace.id,
        ledger: body.ledger,
        name: body.name,
        targetAmount: body.targetAmount,
        currentAmount: body.currentAmount ?? 0,
        targetDate: parseOptionalDate(body.targetDate) ?? null,
        notes: body.notes ?? null,
      },
    });

    return NextResponse.json({ goal });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("goals POST", err);
    return NextResponse.json({ error: "Failed to create goal" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = updateSchema.parse(await req.json());

    const existing = await prisma.goal.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const goal = await prisma.goal.update({
      where: { id: body.id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.targetAmount != null ? { targetAmount: body.targetAmount } : {}),
        ...(body.currentAmount != null ? { currentAmount: body.currentAmount } : {}),
        ...(body.targetDate !== undefined
          ? { targetDate: parseOptionalDate(body.targetDate) ?? null }
          : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    return NextResponse.json({ goal });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("goals PATCH", err);
    return NextResponse.json({ error: "Failed to update goal" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const existing = await prisma.goal.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    await prisma.goal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("goals DELETE", err);
    return NextResponse.json({ error: "Failed to delete goal" }, { status: 500 });
  }
}

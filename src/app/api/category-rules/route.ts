import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { upsertMerchantRule } from "@/lib/categorize";
import { prisma } from "@/lib/db";
import type { Ledger } from "@/lib/types";
import { ledgerSlugSchema } from "@/lib/workspace-ledgers";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as Ledger) || "personal";

    const rules = await prisma.categoryRule.findMany({
      where: { workspaceId: workspace.id, ledger },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ rules });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load rules" }, { status: 500 });
  }
}

const createSchema = z.object({
  ledger: ledgerSlugSchema,
  merchantName: z.string().min(1),
  categoryId: z.string().min(1),
  applyToPast: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = createSchema.parse(await req.json());

    const category = await prisma.category.findFirst({
      where: {
        id: body.categoryId,
        workspaceId: workspace.id,
        ledger: body.ledger,
      },
    });
    if (!category) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    const result = await upsertMerchantRule({
      workspaceId: workspace.id,
      ledger: body.ledger,
      merchantName: body.merchantName,
      categoryId: body.categoryId,
      applyToPast: body.applyToPast,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("category-rules POST", err);
    return NextResponse.json({ error: "Failed to save rule" }, { status: 500 });
  }
}

const deleteSchema = z.object({
  id: z.string(),
});

export async function DELETE(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = deleteSchema.parse(await req.json());

    const existing = await prisma.categoryRule.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.categoryRule.delete({ where: { id: existing.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to delete rule" }, { status: 500 });
  }
}

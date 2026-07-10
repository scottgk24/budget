import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/format";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = searchParams.get("ledger") as "personal" | "business" | null;
    const month = searchParams.get("month");
    const q = searchParams.get("q")?.trim();
    const take = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    const where: Record<string, unknown> = { workspaceId: workspace.id };
    if (ledger === "personal" || ledger === "business") {
      where.ledger = ledger;
    }
    if (month) {
      const { start, end } = monthRange(month);
      where.date = { gte: start, lte: end };
    }
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { merchantName: { contains: q } },
        { notes: { contains: q } },
      ];
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        account: { select: { id: true, name: true, mask: true, type: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
    });

    return NextResponse.json({ transactions });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable().optional(),
  ledger: z.enum(["personal", "business"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.transaction.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (body.categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: body.categoryId, workspaceId: workspace.id },
      });
      if (!cat) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
    }

    const transaction = await prisma.transaction.update({
      where: { id: body.id },
      data: {
        categoryId: body.categoryId === undefined ? undefined : body.categoryId,
        ledger: body.ledger,
        notes: body.notes === undefined ? undefined : body.notes,
      },
      include: { category: true, account: true },
    });

    return NextResponse.json({ transaction });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { monthKey, monthRange } from "@/lib/format";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as "personal" | "business") || "personal";
    const month = searchParams.get("month") || monthKey();

    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id, ledger },
      orderBy: { name: "asc" },
    });

    const budgets = await prisma.budget.findMany({
      where: { workspaceId: workspace.id, ledger, month },
      include: { category: true },
    });

    const { start, end } = monthRange(month);
    const spent = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        workspaceId: workspace.id,
        ledger,
        date: { gte: start, lte: end },
        amount: { gt: 0 },
        pending: false,
      },
      _sum: { amount: true },
    });

    const spentByCategory = Object.fromEntries(
      spent.map((s) => [s.categoryId ?? "uncategorized", s._sum.amount ?? 0]),
    );

    return NextResponse.json({ categories, budgets, spentByCategory, month });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load budgets" }, { status: 500 });
  }
}

const upsertSchema = z.object({
  categoryId: z.string(),
  ledger: z.enum(["personal", "business"]),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.number().min(0),
});

export async function PUT(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = upsertSchema.parse(await req.json());

    const category = await prisma.category.findFirst({
      where: { id: body.categoryId, workspaceId: workspace.id, ledger: body.ledger },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const budget = await prisma.budget.upsert({
      where: {
        workspaceId_categoryId_month_ledger: {
          workspaceId: workspace.id,
          categoryId: body.categoryId,
          month: body.month,
          ledger: body.ledger,
        },
      },
      create: {
        workspaceId: workspace.id,
        categoryId: body.categoryId,
        month: body.month,
        ledger: body.ledger,
        amount: body.amount,
      },
      update: { amount: body.amount },
      include: { category: true },
    });

    return NextResponse.json({ budget });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to save budget" }, { status: 500 });
  }
}

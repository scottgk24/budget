import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computeFundMonth, ensureDefaultFunds } from "@/lib/funds";
import { monthKey } from "@/lib/format";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || monthKey();
    await ensureDefaultFunds(workspace.id);
    const plan = await computeFundMonth({
      workspaceId: workspace.id,
      month,
    });
    const funds = await prisma.fund.findMany({
      where: { workspaceId: workspace.id, ledger: "personal" },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ funds, month, plan });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("funds GET", err);
    return NextResponse.json({ error: "Failed to load funds" }, { status: 500 });
  }
}

const patchSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  monthlyContribution: z
    .object({
      fundId: z.string(),
      amount: z.number().min(0),
    })
    .optional(),
  defaultFund: z
    .object({
      categoryId: z.string(),
      fundId: z.string().nullable(),
    })
    .optional(),
  cover: z
    .object({
      fromFundId: z.string(),
      amount: z.number().positive(),
    })
    .optional(),
});

export async function PATCH(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = patchSchema.parse(await req.json());
    const month = body.month || monthKey();

    if (body.monthlyContribution) {
      const fund = await prisma.fund.findFirst({
        where: {
          id: body.monthlyContribution.fundId,
          workspaceId: workspace.id,
          ledger: "personal",
          kind: "reserve",
        },
      });
      if (!fund) {
        return NextResponse.json({ error: "Reserve not found" }, { status: 404 });
      }
      await prisma.fund.update({
        where: { id: fund.id },
        data: { monthlyContribution: Math.round(body.monthlyContribution.amount * 100) / 100 },
      });
    }

    if (body.defaultFund) {
      const category = await prisma.category.findFirst({
        where: {
          id: body.defaultFund.categoryId,
          workspaceId: workspace.id,
          ledger: "personal",
        },
      });
      if (!category) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
      if (body.defaultFund.fundId) {
        const fund = await prisma.fund.findFirst({
          where: {
            id: body.defaultFund.fundId,
            workspaceId: workspace.id,
            ledger: "personal",
          },
        });
        if (!fund || fund.kind === "buffer") {
          return NextResponse.json({ error: "Invalid fund" }, { status: 400 });
        }
      }
      await prisma.category.update({
        where: { id: category.id },
        data: { defaultFundId: body.defaultFund.fundId },
      });
      await prisma.transaction.updateMany({
        where: {
          workspaceId: workspace.id,
          categoryId: category.id,
          OR: [{ fundSource: null }, { fundSource: "category" }],
        },
        data: {
          fundId: body.defaultFund.fundId,
          fundSource: body.defaultFund.fundId ? "category" : null,
        },
      });
    }

    if (body.cover) {
      const plan = await computeFundMonth({ workspaceId: workspace.id, month });
      if (!plan || plan.uncoveredOverspend <= 0) {
        return NextResponse.json({ error: "Nothing to cover" }, { status: 400 });
      }
      const from = plan.funds.find((f) => f.id === body.cover!.fromFundId);
      if (!from || from.kind !== "reserve") {
        return NextResponse.json({ error: "Cover from a reserve" }, { status: 400 });
      }
      const amount = Math.min(body.cover.amount, plan.uncoveredOverspend);
      if (amount <= 0) {
        return NextResponse.json({ error: "Invalid cover amount" }, { status: 400 });
      }
      await prisma.fundCover.create({
        data: {
          workspaceId: workspace.id,
          ledger: "personal",
          month,
          fromFundId: from.id,
          amount,
        },
      });
    }

    const plan = await computeFundMonth({ workspaceId: workspace.id, month });
    const funds = await prisma.fund.findMany({
      where: { workspaceId: workspace.id, ledger: "personal" },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ funds, month, plan });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("funds PATCH", err);
    return NextResponse.json({ error: "Failed to update funds" }, { status: 500 });
  }
}

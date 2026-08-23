import { NextResponse } from "next/server";
import { z } from "zod";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import {
  AuthError,
  ensureMissingDefaultCategories,
  ensureUserAndWorkspace,
} from "@/lib/auth";
import { excludeNonSpendCategory, isAnnualBudgetPeriod } from "@/lib/categories";
import { computeFundMonth, ensureDefaultFunds } from "@/lib/funds";
import { prisma } from "@/lib/db";
import { ledgerSlugSchema } from "@/lib/workspace-ledgers";
import { parseLedger } from "@/lib/ledger";
import { isPersonalLedger } from "@/lib/workspace-ledgers";
import {
  monthKey,
  monthRange,
  yearFromPeriod,
  yearRange,
} from "@/lib/format";

const AVG_MONTHS = 6;

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = parseLedger(searchParams.get("ledger")) ?? "personal";
    const isPersonal = await isPersonalLedger(workspace.id, ledger);
    const month = searchParams.get("month") || monthKey();
    const year = yearFromPeriod(month);

    await ensureMissingDefaultCategories(workspace.id);
    if (isPersonal) {
      await ensureDefaultFunds(workspace.id);
    }

    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id, ledger },
      orderBy: { name: "asc" },
    });

    const annualIds = categories
      .filter((c) => isAnnualBudgetPeriod(c.budgetPeriod))
      .map((c) => c.id);
    const monthlyIds = categories
      .filter((c) => !isAnnualBudgetPeriod(c.budgetPeriod))
      .map((c) => c.id);

    const [monthlyBudgets, annualBudgets] = await Promise.all([
      monthlyIds.length
        ? prisma.budget.findMany({
            where: {
              workspaceId: workspace.id,
              ledger,
              month,
              categoryId: { in: monthlyIds },
            },
            include: { category: true },
          })
        : Promise.resolve([]),
      annualIds.length
        ? prisma.budget.findMany({
            where: {
              workspaceId: workspace.id,
              ledger,
              month: year,
              categoryId: { in: annualIds },
            },
            include: { category: true },
          })
        : Promise.resolve([]),
    ]);

    const budgets = [...monthlyBudgets, ...annualBudgets];

    const { start, end } = monthRange(month);
    const { start: yearStart, end: yearEnd } = yearRange(year);
    const histStart = startOfMonth(subMonths(startOfMonth(start), AVG_MONTHS));
    const histEnd = endOfMonth(subMonths(startOfMonth(start), 1));

    const [spent, spentYtd, historicalTxs] = await Promise.all([
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          workspaceId: workspace.id,
          ledger,
          date: { gte: start, lte: end },
          pending: false,
          ...excludeNonSpendCategory,
        },
        _sum: { amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          workspaceId: workspace.id,
          ledger,
          date: { gte: yearStart, lte: yearEnd },
          pending: false,
          ...excludeNonSpendCategory,
        },
        _sum: { amount: true },
      }),
      prisma.transaction.findMany({
        where: {
          workspaceId: workspace.id,
          ledger,
          date: { gte: histStart, lte: histEnd },
          pending: false,
          ...excludeNonSpendCategory,
        },
        select: { date: true, categoryId: true, amount: true },
      }),
    ]);

    const spentByCategory = Object.fromEntries(
      spent.map((s) => [s.categoryId ?? "uncategorized", s._sum.amount ?? 0]),
    );
    const spentYtdByCategory = Object.fromEntries(
      spentYtd.map((s) => [s.categoryId ?? "uncategorized", s._sum.amount ?? 0]),
    );

    const histSum = new Map<string, number>();
    const histMonths = new Map<string, Set<string>>();
    for (const tx of historicalTxs) {
      const cat = tx.categoryId ?? "uncategorized";
      histSum.set(cat, (histSum.get(cat) ?? 0) + tx.amount);
      let months = histMonths.get(cat);
      if (!months) {
        months = new Set();
        histMonths.set(cat, months);
      }
      months.add(monthKey(tx.date));
    }
    let maxDivisor = 0;
    const averageByCategory = Object.fromEntries(
      [...histSum.entries()].map(([cat, sum]) => {
        const divisor = Math.max(1, histMonths.get(cat)?.size ?? 1);
        maxDivisor = Math.max(maxDivisor, divisor);
        return [cat, Math.round((sum / divisor) * 100) / 100];
      }),
    );

    const fundPlan =
      isPersonal
        ? await computeFundMonth({ workspaceId: workspace.id, month })
        : null;
    const funds =
      isPersonal
        ? await prisma.fund.findMany({
            where: { workspaceId: workspace.id, ledger: "personal" },
            orderBy: { sortOrder: "asc" },
          })
        : [];

    return NextResponse.json({
      categories,
      budgets,
      spentByCategory,
      spentYtdByCategory,
      averageByCategory,
      averageMonths: maxDivisor || AVG_MONTHS,
      month,
      year,
      funds,
      fundPlan,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load budgets" }, { status: 500 });
  }
}

const upsertSchema = z.object({
  categoryId: z.string(),
  ledger: ledgerSlugSchema,
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

    const periodKey = isAnnualBudgetPeriod(category.budgetPeriod)
      ? yearFromPeriod(body.month)
      : body.month;

    const budget = await prisma.budget.upsert({
      where: {
        workspaceId_categoryId_month_ledger: {
          workspaceId: workspace.id,
          categoryId: body.categoryId,
          month: periodKey,
          ledger: body.ledger,
        },
      },
      create: {
        workspaceId: workspace.id,
        categoryId: body.categoryId,
        month: periodKey,
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

const periodSchema = z.object({
  categoryId: z.string(),
  ledger: ledgerSlugSchema,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  budgetPeriod: z.enum(["monthly", "annual"]),
});

/** Flip monthly/annual and seed the other period's amount when missing. */
export async function PATCH(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = periodSchema.parse(await req.json());
    const year = yearFromPeriod(body.month);

    const category = await prisma.category.findFirst({
      where: { id: body.categoryId, workspaceId: workspace.id, ledger: body.ledger },
    });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const fromAnnual = isAnnualBudgetPeriod(category.budgetPeriod);
    const toAnnual = body.budgetPeriod === "annual";
    if (fromAnnual === toAnnual) {
      return NextResponse.json({ category });
    }

    const updated = await prisma.category.update({
      where: { id: category.id },
      data: { budgetPeriod: body.budgetPeriod },
    });

    if (toAnnual) {
      const monthly = await prisma.budget.findUnique({
        where: {
          workspaceId_categoryId_month_ledger: {
            workspaceId: workspace.id,
            categoryId: category.id,
            month: body.month,
            ledger: body.ledger,
          },
        },
      });
      const existingYear = await prisma.budget.findUnique({
        where: {
          workspaceId_categoryId_month_ledger: {
            workspaceId: workspace.id,
            categoryId: category.id,
            month: year,
            ledger: body.ledger,
          },
        },
      });
      if (!existingYear && monthly && monthly.amount > 0) {
        await prisma.budget.create({
          data: {
            workspaceId: workspace.id,
            categoryId: category.id,
            month: year,
            ledger: body.ledger,
            amount: Math.round(monthly.amount * 12),
          },
        });
      }
    } else {
      const yearly = await prisma.budget.findUnique({
        where: {
          workspaceId_categoryId_month_ledger: {
            workspaceId: workspace.id,
            categoryId: category.id,
            month: year,
            ledger: body.ledger,
          },
        },
      });
      const existingMonth = await prisma.budget.findUnique({
        where: {
          workspaceId_categoryId_month_ledger: {
            workspaceId: workspace.id,
            categoryId: category.id,
            month: body.month,
            ledger: body.ledger,
          },
        },
      });
      if (!existingMonth && yearly && yearly.amount > 0) {
        await prisma.budget.create({
          data: {
            workspaceId: workspace.id,
            categoryId: category.id,
            month: body.month,
            ledger: body.ledger,
            amount: Math.round(yearly.amount / 12),
          },
        });
      }
    }

    return NextResponse.json({ category: updated });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to update budget period" }, { status: 500 });
  }
}

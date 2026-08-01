import { NextResponse } from "next/server";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import {
  excludeNonSpendCategory,
  incomeCategoryFilter,
  isAnnualBudgetPeriod,
  NON_SPEND_CATEGORIES,
  personalSpendFlexibility,
} from "@/lib/categories";
import { prisma } from "@/lib/db";
import { sumNetBalances } from "@/lib/accounts";
import {
  monthKey,
  monthRange,
  monthlyAllotment,
  yearFromPeriod,
  yearRange,
} from "@/lib/format";
import { buildSpendPace } from "@/lib/reports";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as "personal" | "business") || "personal";
    const month = searchParams.get("month") || monthKey();
    const year = yearFromPeriod(month);
    const { start, end } = monthRange(month);
    const { start: yearStart, end: yearEnd } = yearRange(year);

    const accounts = await prisma.account.findMany({
      where: { workspaceId: workspace.id, ledger, isHidden: false },
    });

    const totalBalance = sumNetBalances(accounts);

    const monthTx = await prisma.transaction.findMany({
      where: {
        workspaceId: workspace.id,
        ledger,
        date: { gte: start, lte: end },
        pending: false,
      },
      include: { category: true, account: true },
      orderBy: { date: "desc" },
      take: 8,
    });

    const baseMonth = {
      workspaceId: workspace.id,
      ledger,
      date: { gte: start, lte: end },
      pending: false,
    };

    const [spendAgg, incomeAgg, categories, monthlyBudgets, annualBudgets, byCategory, byCategoryYtd, holdings] =
      await Promise.all([
        prisma.transaction.aggregate({
          where: {
            ...baseMonth,
            ...excludeNonSpendCategory,
          },
          _sum: { amount: true },
        }),
        prisma.transaction.aggregate({
          where: {
            ...baseMonth,
            amount: { lt: 0 },
            ...incomeCategoryFilter,
          },
          _sum: { amount: true },
        }),
        prisma.category.findMany({
          where: { workspaceId: workspace.id, ledger },
        }),
        prisma.budget.findMany({
          where: { workspaceId: workspace.id, ledger, month },
          include: { category: true },
        }),
        prisma.budget.findMany({
          where: { workspaceId: workspace.id, ledger, month: year },
          include: { category: true },
        }),
        prisma.transaction.groupBy({
          by: ["categoryId"],
          where: {
            ...baseMonth,
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
        prisma.holding.findMany({
          where: {
            workspaceId: workspace.id,
            account: { ledger },
          },
          include: { account: { select: { name: true } } },
          orderBy: { value: "desc" },
          take: 8,
        }),
      ]);

    const catMap = Object.fromEntries(categories.map((c) => [c.id, c]));
    const nonSpend = new Set<string>(NON_SPEND_CATEGORIES);
    const annualIdSet = new Set(
      categories.filter((c) => isAnnualBudgetPeriod(c.budgetPeriod)).map((c) => c.id),
    );

    const monthlyBudgetByCat = Object.fromEntries(
      monthlyBudgets
        .filter((b) => !annualIdSet.has(b.categoryId))
        .map((b) => [b.categoryId, b.amount]),
    );
    const annualBudgetByCat = Object.fromEntries(
      annualBudgets
        .filter((b) => annualIdSet.has(b.categoryId))
        .map((b) => [b.categoryId, b.amount]),
    );

    let budgetTotal = 0;
    for (const amount of Object.values(monthlyBudgetByCat)) {
      budgetTotal += amount;
    }
    for (const amount of Object.values(annualBudgetByCat)) {
      budgetTotal += monthlyAllotment(amount);
    }

    const spentYtdByCat = Object.fromEntries(
      byCategoryYtd.map((row) => [row.categoryId ?? "uncategorized", row._sum.amount ?? 0]),
    );

    const categorySpend = byCategory
      .map((row) => {
        const cat = row.categoryId ? catMap[row.categoryId] : null;
        const name = cat?.name ?? (row.categoryId ? "Uncategorized" : "Uncategorized");
        const annual = row.categoryId ? annualIdSet.has(row.categoryId) : false;
        const spent = annual
          ? (spentYtdByCat[row.categoryId ?? "uncategorized"] ?? 0)
          : (row._sum.amount ?? 0);
        const budget = annual
          ? (row.categoryId ? (annualBudgetByCat[row.categoryId] ?? null) : null)
          : (row.categoryId ? (monthlyBudgetByCat[row.categoryId] ?? null) : null);
        return {
          categoryId: row.categoryId,
          name,
          spent,
          budget,
          budgetPeriod: annual ? ("annual" as const) : ("monthly" as const),
          monthSpent: row._sum.amount ?? 0,
          flexibility:
            ledger === "personal" ? personalSpendFlexibility(name) : null,
        };
      })
      .filter((row) => !nonSpend.has(row.name))
      .sort((a, b) => b.monthSpent - a.monthSpent)
      .slice(0, 6);

    const spent = spendAgg._sum.amount ?? 0;

    let fixedSpend = 0;
    let discretionarySpend = 0;
    let fixedBudget = 0;
    let discretionaryBudget = 0;

    if (ledger === "personal") {
      for (const row of byCategory) {
        const cat = row.categoryId ? catMap[row.categoryId] : null;
        const name = cat?.name ?? "Uncategorized";
        if (nonSpend.has(name)) continue;
        const amount = row._sum.amount ?? 0;
        if (personalSpendFlexibility(name) === "fixed") fixedSpend += amount;
        else discretionarySpend += amount;
      }

      for (const [categoryId, amount] of Object.entries(monthlyBudgetByCat)) {
        const name = catMap[categoryId]?.name ?? "Uncategorized";
        if (personalSpendFlexibility(name) === "fixed") fixedBudget += amount;
        else discretionaryBudget += amount;
      }
      for (const [categoryId, amount] of Object.entries(annualBudgetByCat)) {
        const name = catMap[categoryId]?.name ?? "Uncategorized";
        const monthly = monthlyAllotment(amount);
        if (personalSpendFlexibility(name) === "fixed") fixedBudget += monthly;
        else discretionaryBudget += monthly;
      }
    }

    const paceBudget =
      ledger === "personal" && discretionaryBudget > 0
        ? discretionaryBudget
        : budgetTotal;
    const paceSpent =
      ledger === "personal" && discretionaryBudget > 0
        ? discretionarySpend
        : spent;

    const spendPace = await buildSpendPace({
      workspaceId: workspace.id,
      ledger,
      month,
      budgetTotal: paceBudget,
      spentToDate: paceSpent,
      flexibility:
        ledger === "personal" && discretionaryBudget > 0
          ? "discretionary"
          : "all",
    });

    return NextResponse.json({
      month,
      year,
      ledger,
      totalBalance,
      accountCount: accounts.length,
      spent,
      fixedSpend: ledger === "personal" ? fixedSpend : null,
      discretionarySpend: ledger === "personal" ? discretionarySpend : null,
      fixedBudget: ledger === "personal" ? fixedBudget : null,
      discretionaryBudget: ledger === "personal" ? discretionaryBudget : null,
      income: Math.abs(incomeAgg._sum.amount ?? 0),
      budgetTotal,
      recent: monthTx,
      categorySpend,
      holdings,
      accounts,
      spendPace,
      spendPaceScope:
        ledger === "personal" && discretionaryBudget > 0
          ? "discretionary"
          : "all",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("dashboard", err);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}

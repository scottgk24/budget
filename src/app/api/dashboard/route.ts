import { NextResponse } from "next/server";
import { parseISO, subMonths } from "date-fns";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import {
  excludeNonSpendCategory,
  incomeCategoryFilter,
  isAnnualBudgetPeriod,
  NON_SPEND_CATEGORIES,
  fundKindForSlug,
  defaultFundSlugForCategoryName,
} from "@/lib/categories";
import { computeFundMonth, ensureDefaultFunds } from "@/lib/funds";
import { prisma } from "@/lib/db";
import { splitAccountBalances, sumNetBalances } from "@/lib/accounts";
import { totalsFromAccounts } from "@/lib/net-worth";
import { normalizeHoldings } from "@/lib/holdings";
import {
  monthKey,
  monthRange,
  monthlyAllotment,
  prevMonthKey,
  yearFromPeriod,
  yearRange,
} from "@/lib/format";
import { buildSpendPace } from "@/lib/reports";
import { parseLedger } from "@/lib/ledger";
import { isPersonalLedger } from "@/lib/workspace-ledgers";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = parseLedger(searchParams.get("ledger")) ?? "personal";
    const isPersonal = await isPersonalLedger(workspace.id, ledger);
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
          include: { account: { select: { name: true, id: true } } },
          orderBy: { value: "desc" },
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
          fundKind:
            isPersonal
              ? fundKindForSlug(defaultFundSlugForCategoryName(name))
              : null,
        };
      })
      .filter((row) => !nonSpend.has(row.name))
      .sort((a, b) => b.monthSpent - a.monthSpent)
      .slice(0, 6);

    const spent = spendAgg._sum.amount ?? 0;
    const income = Math.abs(incomeAgg._sum.amount ?? 0);

    const trailEnd = monthRange(prevMonthKey(month)).end;
    const trailStart = monthRange(
      monthKey(subMonths(parseISO(`${month}-01`), 3)),
    ).start;
    const trailingIncomeAgg = await prisma.transaction.aggregate({
      where: {
        workspaceId: workspace.id,
        ledger,
        date: { gte: trailStart, lte: trailEnd },
        pending: false,
        amount: { lt: 0 },
        ...incomeCategoryFilter,
      },
      _sum: { amount: true },
    });
    const trailingIncomeAverage =
      Math.round((Math.abs(trailingIncomeAgg._sum.amount ?? 0) / 3) * 100) / 100;
    const incomeIncomplete =
      trailingIncomeAverage >= 100 && income < trailingIncomeAverage * 0.6;

    let fundPlan = null;
    let committedSpend = 0;
    let flexibleSpend = 0;
    let reserveSpend = 0;
    let flexibleBudget = 0;
    let committedBudget = 0;
    let flexibleLeft: number | null = null;
    let flexibleOverspend = 0;

    if (isPersonal) {
      await ensureDefaultFunds(workspace.id);
      fundPlan = await computeFundMonth({ workspaceId: workspace.id, month });
      if (fundPlan) {
        committedSpend = fundPlan.funds.find((f) => f.slug === "committed")?.spent ?? 0;
        flexibleSpend = fundPlan.flexibleSpent;
        reserveSpend = fundPlan.funds
          .filter((f) => f.kind === "reserve")
          .reduce((sum, f) => sum + f.spent, 0);
        flexibleBudget = Math.max(0, fundPlan.flexibleAssigned - fundPlan.carriedOverspend);
        committedBudget = fundPlan.committedNeed;
        flexibleLeft =
          Math.round(
            (fundPlan.flexibleAssigned -
              fundPlan.carriedOverspend -
              fundPlan.flexibleSpent) *
              100,
          ) / 100;
        flexibleOverspend = flexibleLeft < 0 ? Math.abs(flexibleLeft) : 0;
      }
    }

    const useFlexiblePace = isPersonal && fundPlan != null;
    const paceBudget = useFlexiblePace ? flexibleBudget : budgetTotal;
    const paceSpent = useFlexiblePace ? flexibleSpend : spent;

    const spendPace = await buildSpendPace({
      workspaceId: workspace.id,
      ledger,
      month,
      budgetTotal: paceBudget,
      spentToDate: paceSpent,
      fundKind: useFlexiblePace ? "flexible" : "all",
    });

    if (useFlexiblePace && flexibleLeft != null) {
      spendPace.freeToSpend = Math.max(0, flexibleLeft);
    }

    const wealth = totalsFromAccounts(accounts);
    const balances = splitAccountBalances(accounts, holdings);
    const holdingsNormalized = normalizeHoldings(
      holdings.map((h) => ({
        ...h,
        accountId: h.accountId,
      })),
    ).slice(0, 8);

    return NextResponse.json({
      month,
      year,
      ledger,
      totalBalance,
      assets: wealth.assets,
      liabilities: wealth.liabilities,
      cashBalance: balances.cash,
      otherAssetBalance: balances.otherAssets,
      creditCardDebt: balances.creditCards,
      accountCount: accounts.length,
      spent,
      fixedSpend: isPersonal ? committedSpend : null,
      discretionarySpend: isPersonal ? flexibleSpend : null,
      reserveSpend: isPersonal ? reserveSpend : null,
      fixedBudget: isPersonal ? committedBudget : null,
      discretionaryBudget: isPersonal ? flexibleBudget : null,
      flexibleLeft,
      flexibleOverspend,
      fundPlan,
      income,
      trailingIncomeAverage,
      incomeIncomplete,
      budgetTotal,
      recent: monthTx,
      categorySpend,
      holdings: holdingsNormalized,
      accounts,
      spendPace,
      spendPaceScope: useFlexiblePace ? "discretionary" : "all",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("dashboard", err);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}

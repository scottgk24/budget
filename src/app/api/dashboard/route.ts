import { NextResponse } from "next/server";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { excludeNonSpendCategory, excludeTransfersCategory, NON_SPEND_CATEGORIES } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { monthKey, monthRange } from "@/lib/format";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as "personal" | "business") || "personal";
    const month = searchParams.get("month") || monthKey();
    const { start, end } = monthRange(month);

    const accounts = await prisma.account.findMany({
      where: { workspaceId: workspace.id, ledger, isHidden: false },
    });

    const totalBalance = accounts.reduce((sum, a) => sum + (a.currentBalance ?? 0), 0);

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

    const spendAgg = await prisma.transaction.aggregate({
      where: {
        ...baseMonth,
        amount: { gt: 0 },
        ...excludeNonSpendCategory,
      },
      _sum: { amount: true },
    });
    const incomeAgg = await prisma.transaction.aggregate({
      where: {
        ...baseMonth,
        amount: { lt: 0 },
        ...excludeTransfersCategory,
      },
      _sum: { amount: true },
    });

    const budgets = await prisma.budget.findMany({
      where: { workspaceId: workspace.id, ledger, month },
      include: { category: true },
    });
    const budgetTotal = budgets.reduce((sum, b) => sum + b.amount, 0);

    const byCategory = await prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        ...baseMonth,
        amount: { gt: 0 },
        ...excludeNonSpendCategory,
      },
      _sum: { amount: true },
    });

    const categories = await prisma.category.findMany({
      where: { workspaceId: workspace.id, ledger },
    });
    const catMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    const nonSpend = new Set<string>(NON_SPEND_CATEGORIES);

    const categorySpend = byCategory
      .map((row) => ({
        categoryId: row.categoryId,
        name: row.categoryId ? catMap[row.categoryId] ?? "Uncategorized" : "Uncategorized",
        spent: row._sum.amount ?? 0,
        budget: budgets.find((b) => b.categoryId === row.categoryId)?.amount ?? null,
      }))
      .filter((row) => !nonSpend.has(row.name))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 6);

    const holdings = await prisma.holding.findMany({
      where: {
        workspaceId: workspace.id,
        account: { ledger },
      },
      include: { account: { select: { name: true } } },
      orderBy: { value: "desc" },
      take: 8,
    });

    return NextResponse.json({
      month,
      ledger,
      totalBalance,
      accountCount: accounts.length,
      spent: spendAgg._sum.amount ?? 0,
      income: Math.abs(incomeAgg._sum.amount ?? 0),
      budgetTotal,
      recent: monthTx,
      categorySpend,
      holdings,
      accounts,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("dashboard", err);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}

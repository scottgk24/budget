import {
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import {
  excludeNonSpendCategory,
  incomeCategoryFilter,
  isIncomeAmount,
  isSpendAmount,
  merchantRuleKey,
} from "@/lib/categories";
import { computeAgeOfMoney } from "@/lib/age-of-money";
import { prisma } from "@/lib/db";
import { metricsRange, monthKey, type MetricsRangeId } from "@/lib/format";
import type { SpendPacePoint } from "@/lib/report-types";
import type { Ledger } from "@/lib/types";

export type { SpendPacePoint };

export async function buildSpendPace(params: {
  workspaceId: string;
  ledger: Ledger;
  month: string;
  budgetTotal: number;
  spentToDate: number;
}) {
  const { workspaceId, ledger, month, budgetTotal } = params;
  const start = startOfMonth(new Date(`${month}-01T12:00:00`));
  const end = endOfMonth(start);
  const today = new Date();
  const days = eachDayOfInterval({ start, end });
  const dayCount = days.length;

  const txs = await prisma.transaction.findMany({
    where: {
      workspaceId,
      ledger,
      pending: false,
      date: { gte: start, lte: end },
      ...excludeNonSpendCategory,
      amount: { gt: 0 },
    },
    select: { amount: true, date: true },
    orderBy: { date: "asc" },
  });

  const spendByDay = new Map<string, number>();
  for (const tx of txs) {
    const key = format(tx.date, "yyyy-MM-dd");
    spendByDay.set(key, (spendByDay.get(key) ?? 0) + tx.amount);
  }

  let cumulative = 0;
  const series: SpendPacePoint[] = days.map((d, i) => {
    const key = format(d, "yyyy-MM-dd");
    const ideal =
      budgetTotal > 0
        ? Math.round(((budgetTotal * (i + 1)) / dayCount) * 100) / 100
        : 0;
    const isFuture = d > today;
    if (!isFuture) {
      cumulative += spendByDay.get(key) ?? 0;
    }
    return {
      day: i + 1,
      label: format(d, "MMM d"),
      actual: isFuture ? null : Math.round(cumulative * 100) / 100,
      ideal,
      date: key,
    };
  });

  const dayOfMonth = Math.min(
    today < start ? 0 : today > end ? dayCount : today.getDate(),
    dayCount,
  );
  const idealToDate =
    budgetTotal > 0 && dayOfMonth > 0
      ? Math.round(((budgetTotal * dayOfMonth) / dayCount) * 100) / 100
      : 0;

  const freeToSpend =
    budgetTotal > 0
      ? Math.round((budgetTotal - params.spentToDate) * 100) / 100
      : null;

  const paceDelta =
    freeToSpend != null
      ? Math.round((idealToDate - params.spentToDate) * 100) / 100
      : null;

  return {
    series,
    budgetTotal,
    spentToDate: params.spentToDate,
    freeToSpend,
    idealToDate,
    paceDelta,
    dayOfMonth,
    daysInMonth: dayCount,
  };
}

export async function buildReports(params: {
  workspaceId: string;
  ledger: Ledger;
  range: MetricsRangeId;
}) {
  const { workspaceId, ledger, range } = params;
  const { start, end } = metricsRange(range);

  const txs = await prisma.transaction.findMany({
    where: {
      workspaceId,
      ledger,
      pending: false,
      date: { gte: start, lte: end },
    },
    include: { category: { select: { id: true, name: true } } },
    orderBy: { date: "asc" },
  });

  // --- Category trends (monthly stacked) ---
  const months: string[] = [];
  {
    let c = startOfMonth(start);
    const last = startOfMonth(end);
    while (c <= last) {
      months.push(monthKey(c));
      const next = new Date(c);
      next.setMonth(next.getMonth() + 1);
      c = next;
    }
  }

  const catTotals = new Map<string, number>();
  const byMonthCat = new Map<string, Map<string, number>>();
  for (const m of months) byMonthCat.set(m, new Map());

  for (const tx of txs) {
    if (!isSpendAmount(tx.amount, tx.category?.name) || tx.amount <= 0) continue;
    const name = tx.category?.name ?? "Uncategorized";
    const m = monthKey(tx.date);
    const monthMap = byMonthCat.get(m);
    if (!monthMap) continue;
    monthMap.set(name, (monthMap.get(name) ?? 0) + tx.amount);
    catTotals.set(name, (catTotals.get(name) ?? 0) + tx.amount);
  }

  const topCategories = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);

  const categoryTrends = months.map((m) => {
    const monthMap = byMonthCat.get(m)!;
    const row: Record<string, string | number> = {
      key: m,
      label: format(new Date(`${m}-01T12:00:00`), "MMM yy"),
    };
    let other = 0;
    for (const [name, amount] of monthMap) {
      if (topCategories.includes(name)) {
        row[name] = Math.round(amount * 100) / 100;
      } else {
        other += amount;
      }
    }
    for (const name of topCategories) {
      if (row[name] == null) row[name] = 0;
    }
    row.Other = Math.round(other * 100) / 100;
    return row;
  });

  const hasOther = categoryTrends.some(
    (r) => typeof r.Other === "number" && (r.Other as number) > 0,
  );
  const categoryKeys = hasOther
    ? [...topCategories.filter((c) => c !== "Other"), "Other"]
    : topCategories.filter((c) => c !== "Other");
  if (!hasOther) {
    for (const row of categoryTrends) {
      delete row.Other;
    }
  }

  // --- Merchants ---
  const merchantMap = new Map<
    string,
    { merchant: string; amount: number; count: number; categoryName: string | null }
  >();
  for (const tx of txs) {
    if (!isSpendAmount(tx.amount, tx.category?.name) || tx.amount <= 0) continue;
    const raw = tx.merchantName || tx.name;
    const key = merchantRuleKey(raw) || raw.trim().toLowerCase().slice(0, 40);
    if (!key) continue;
    const existing = merchantMap.get(key);
    const display = (tx.merchantName || tx.name).trim();
    if (existing) {
      existing.amount += tx.amount;
      existing.count += 1;
    } else {
      merchantMap.set(key, {
        merchant: display,
        amount: tx.amount,
        count: 1,
        categoryName: tx.category?.name ?? null,
      });
    }
  }
  const merchants = [...merchantMap.values()]
    .map((m) => ({
      ...m,
      amount: Math.round(m.amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15);

  // --- Sankey: Income → categories ---
  let incomeTotal = 0;
  const spendByCat = new Map<string, number>();
  for (const tx of txs) {
    if (isIncomeAmount(tx.amount, tx.category?.name)) {
      incomeTotal += Math.abs(tx.amount);
      continue;
    }
    if (!isSpendAmount(tx.amount, tx.category?.name) || tx.amount <= 0) continue;
    const name = tx.category?.name ?? "Uncategorized";
    spendByCat.set(name, (spendByCat.get(name) ?? 0) + tx.amount);
  }

  const sankeyCats = [...spendByCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const sankeyOther = [...spendByCat.entries()]
    .slice(10)
    .reduce((sum, [, v]) => sum + v, 0);

  const sankeyNodes: Array<{ name: string }> = [{ name: "Income" }];
  const sankeyLinks: Array<{ source: number; target: number; value: number }> =
    [];
  for (const [name, value] of sankeyCats) {
    const idx = sankeyNodes.length;
    sankeyNodes.push({ name });
    sankeyLinks.push({
      source: 0,
      target: idx,
      value: Math.round(value * 100) / 100,
    });
  }
  if (sankeyOther > 0) {
    const idx = sankeyNodes.length;
    sankeyNodes.push({ name: "Other" });
    sankeyLinks.push({
      source: 0,
      target: idx,
      value: Math.round(sankeyOther * 100) / 100,
    });
  }

  const totalSpend = [...spendByCat.values()].reduce((a, b) => a + b, 0);
  const savings = Math.round((incomeTotal - totalSpend) * 100) / 100;

  // --- Age of money ---
  const age = computeAgeOfMoney(
    txs.map((tx) => ({
      amount: tx.amount,
      date: tx.date,
      categoryName: tx.category?.name ?? null,
    })),
  );

  // Income breakdown by merchant/source
  const incomeSources = new Map<string, number>();
  for (const tx of txs) {
    if (!isIncomeAmount(tx.amount, tx.category?.name)) continue;
    const name = (tx.merchantName || tx.name).trim() || "Income";
    incomeSources.set(name, (incomeSources.get(name) ?? 0) + Math.abs(tx.amount));
  }
  const incomeBreakdown = [...incomeSources.entries()]
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  return {
    range,
    start: start.toISOString(),
    end: end.toISOString(),
    totals: {
      income: Math.round(incomeTotal * 100) / 100,
      spend: Math.round(totalSpend * 100) / 100,
      savings,
      savingsRate:
        incomeTotal > 0
          ? Math.round((savings / incomeTotal) * 1000) / 10
          : null,
    },
    categoryTrends: {
      months: categoryTrends,
      keys: categoryKeys,
    },
    merchants,
    sankey: {
      nodes: sankeyNodes,
      links: sankeyLinks,
    },
    ageOfMoney: {
      ageDays: age.ageDays,
      series: age.series.slice(-90),
    },
    incomeBreakdown,
  };
}

/** Re-export for callers that need the filter fragments. */
export { excludeNonSpendCategory, incomeCategoryFilter };

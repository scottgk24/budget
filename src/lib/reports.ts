import {
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import {
  excludeNonSpendCategory,
  isIncomeAmount,
  isSpendAmount,
  merchantRuleKey,
  personalSpendFlexibility,
  type SpendFlexibility,
} from "@/lib/categories";
import { computeAgeOfMoney } from "@/lib/age-of-money";
import { prisma } from "@/lib/db";
import { metricsRange, monthKey, type MetricsRangeId } from "@/lib/format";
import type { SpendPacePoint } from "@/lib/report-types";
import type { Ledger } from "@/lib/types";

export type { SpendPacePoint };

type SankeyNode = { name: string };
type SankeyLink = { source: number; target: number; value: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Keep the largest branches; roll the rest into Other. */
function trimFlows(
  entries: Array<{ name: string; value: number }>,
  maxNamed: number,
  minShare: number,
): Array<{ name: string; value: number }> {
  const total = entries.reduce((s, e) => s + e.value, 0);
  if (total <= 0) return [];
  const sorted = [...entries].sort((a, b) => b.value - a.value);
  const flows: Array<{ name: string; value: number }> = [];
  let other = 0;
  for (const entry of sorted) {
    if (entry.name === "Other") {
      other += entry.value;
      continue;
    }
    const share = entry.value / total;
    if (flows.length >= maxNamed || (flows.length >= 2 && share < minShare)) {
      other += entry.value;
      continue;
    }
    flows.push({ ...entry });
  }
  if (other > 0) {
    if (other / total < 0.04 && flows.length > 0) {
      flows[flows.length - 1]!.value = round2(
        flows[flows.length - 1]!.value + other,
      );
    } else {
      flows.push({ name: "Other", value: round2(other) });
    }
  }
  return flows.map((f) => ({ ...f, value: round2(f.value) }));
}

/**
 * Business: Income → categories (flat).
 * Personal: Income → Fixed / Discretionary → categories, so controllable spend stands out.
 *
 * When spend exceeds income, fund Fixed first from Income, then Discretionary;
 * Savings only covers the shortfall — avoids Income/Savings ribbons criss-crossing.
 */
export function buildCashFlowSankey(params: {
  ledger: Ledger;
  incomeTotal: number;
  spendByCat: Map<string, number>;
}): { nodes: SankeyNode[]; links: SankeyLink[] } {
  const { ledger, incomeTotal, spendByCat } = params;
  const totalSpend = [...spendByCat.values()].reduce((a, b) => a + b, 0);
  const deficit = round2(Math.max(0, totalSpend - incomeTotal));
  const surplus = round2(Math.max(0, incomeTotal - totalSpend));
  const incomeLabel = ledger === "business" ? "Revenue" : "Income";
  const savingsLabel = ledger === "business" ? "Profit" : "Savings";

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const addNode = (name: string) => {
    nodes.push({ name });
    return nodes.length - 1;
  };

  /** Draw from Income first; Savings only after Income is exhausted. */
  const fundFromIncomeThenSavings = (
    targetIdx: number,
    amount: number,
    incomeIdx: number,
    savingsIdx: number,
    incomeLeft: { value: number },
  ) => {
    if (targetIdx < 0 || amount <= 0) return;
    const fromIncome = round2(Math.min(amount, Math.max(0, incomeLeft.value)));
    const fromSavings = round2(amount - fromIncome);
    if (fromIncome > 0 && incomeIdx >= 0) {
      links.push({ source: incomeIdx, target: targetIdx, value: fromIncome });
      incomeLeft.value = round2(incomeLeft.value - fromIncome);
    }
    if (fromSavings > 0 && savingsIdx >= 0) {
      links.push({ source: savingsIdx, target: targetIdx, value: fromSavings });
    }
  };

  if (ledger !== "personal") {
    const flows = trimFlows(
      [...spendByCat.entries()].map(([name, value]) => ({ name, value })),
      8,
      0.03,
    );
    if (deficit > 0 && totalSpend > 0) {
      const incomeIdx = incomeTotal > 0 ? addNode(incomeLabel) : -1;
      const savingsIdx = addNode(savingsLabel);
      const incomeLeft = { value: incomeTotal };
      for (const { name, value } of flows) {
        fundFromIncomeThenSavings(
          addNode(name),
          value,
          incomeIdx,
          savingsIdx,
          incomeLeft,
        );
      }
    } else {
      const incomeIdx = addNode(incomeLabel);
      for (const { name, value } of flows) {
        links.push({ source: incomeIdx, target: addNode(name), value });
      }
      if (surplus > 0) {
        links.push({
          source: incomeIdx,
          target: addNode(savingsLabel),
          value: surplus,
        });
      }
    }
    return { nodes, links };
  }

  // Personal: middle Fixed / Discretionary layer, then category detail.
  const byFlex = new Map<
    SpendFlexibility,
    Array<{ name: string; value: number }>
  >([
    ["fixed", []],
    ["discretionary", []],
  ]);
  for (const [name, value] of spendByCat) {
    byFlex.get(personalSpendFlexibility(name))!.push({ name, value });
  }
  const fixedFlows = trimFlows(byFlex.get("fixed")!, 6, 0.04);
  const discFlows = trimFlows(byFlex.get("discretionary")!, 7, 0.04);
  const fixedTotal = round2(fixedFlows.reduce((s, f) => s + f.value, 0));
  const discTotal = round2(discFlows.reduce((s, f) => s + f.value, 0));

  const incomeIdx =
    incomeTotal > 0 || surplus > 0 || fixedTotal + discTotal === 0
      ? addNode(incomeLabel)
      : -1;
  const savingsSourceIdx =
    deficit > 0 && totalSpend > 0 ? addNode(savingsLabel) : -1;

  const fixedIdx = fixedTotal > 0 ? addNode("Fixed") : -1;
  const discIdx = discTotal > 0 ? addNode("Discretionary") : -1;

  if (deficit > 0) {
    const incomeLeft = { value: incomeTotal };
    fundFromIncomeThenSavings(
      fixedIdx,
      fixedTotal,
      incomeIdx,
      savingsSourceIdx,
      incomeLeft,
    );
    fundFromIncomeThenSavings(
      discIdx,
      discTotal,
      incomeIdx,
      savingsSourceIdx,
      incomeLeft,
    );
  } else if (incomeIdx >= 0) {
    if (fixedIdx >= 0) {
      links.push({ source: incomeIdx, target: fixedIdx, value: fixedTotal });
    }
    if (discIdx >= 0) {
      links.push({ source: incomeIdx, target: discIdx, value: discTotal });
    }
  }

  const linkCats = (
    middleIdx: number,
    flows: Array<{ name: string; value: number }>,
  ) => {
    if (middleIdx < 0) return;
    for (const { name, value } of flows) {
      if (value <= 0) continue;
      const label =
        name === "Fixed" || name === "Discretionary" ? `${name} (other)` : name;
      links.push({ source: middleIdx, target: addNode(label), value });
    }
  };

  linkCats(fixedIdx, fixedFlows);
  linkCats(discIdx, discFlows);

  if (surplus > 0 && incomeIdx >= 0) {
    links.push({
      source: incomeIdx,
      target: addNode(savingsLabel),
      value: surplus,
    });
  }

  return { nodes, links };
}

export function sumSpendByFlexibility(
  spendByCat: Map<string, number>,
): { fixed: number; discretionary: number } {
  let fixed = 0;
  let discretionary = 0;
  for (const [name, value] of spendByCat) {
    if (personalSpendFlexibility(name) === "fixed") fixed += value;
    else discretionary += value;
  }
  return { fixed: round2(fixed), discretionary: round2(discretionary) };
}

export async function buildSpendPace(params: {
  workspaceId: string;
  ledger: Ledger;
  month: string;
  budgetTotal: number;
  spentToDate: number;
  /** Personal: pace only discretionary spend against a discretionary budget. */
  flexibility?: "all" | "discretionary" | "fixed";
}) {
  const { workspaceId, ledger, month, budgetTotal } = params;
  const flexibility = params.flexibility ?? "all";
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
    select: {
      amount: true,
      date: true,
      category: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });

  const spendByDay = new Map<string, number>();
  for (const tx of txs) {
    if (flexibility !== "all" && ledger === "personal") {
      const flex = personalSpendFlexibility(tx.category?.name);
      if (flex !== flexibility) continue;
    }
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

  // --- Sankey + flexibility totals ---
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

  const totalSpend = [...spendByCat.values()].reduce((a, b) => a + b, 0);
  const savings = round2(incomeTotal - totalSpend);
  const flexibility =
    ledger === "personal"
      ? sumSpendByFlexibility(spendByCat)
      : { fixed: 0, discretionary: round2(totalSpend) };
  const { nodes: sankeyNodes, links: sankeyLinks } = buildCashFlowSankey({
    ledger,
    incomeTotal,
    spendByCat,
  });

  // Monthly fixed vs discretionary (personal tracking)
  const flexibilityTrends =
    ledger === "personal"
      ? months.map((m) => {
          const monthMap = byMonthCat.get(m)!;
          let fixed = 0;
          let discretionary = 0;
          for (const [name, amount] of monthMap) {
            if (personalSpendFlexibility(name) === "fixed") fixed += amount;
            else discretionary += amount;
          }
          return {
            key: m,
            label: format(new Date(`${m}-01T12:00:00`), "MMM yy"),
            Fixed: round2(fixed),
            Discretionary: round2(discretionary),
          };
        })
      : [];

  // Prefer discretionary categories in the stacked trends for personal.
  let reportCategoryTrends = categoryTrends;
  let reportCategoryKeys = categoryKeys;
  if (ledger === "personal") {
    const discTop = [...catTotals.entries()]
      .filter(([name]) => personalSpendFlexibility(name) === "discretionary")
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name]) => name);

    reportCategoryTrends = months.map((m) => {
      const monthMap = byMonthCat.get(m)!;
      const row: Record<string, string | number> = {
        key: m,
        label: format(new Date(`${m}-01T12:00:00`), "MMM yy"),
      };
      let other = 0;
      for (const [name, amount] of monthMap) {
        if (personalSpendFlexibility(name) !== "discretionary") continue;
        if (discTop.includes(name)) {
          row[name] = Math.round(amount * 100) / 100;
        } else {
          other += amount;
        }
      }
      for (const name of discTop) {
        if (row[name] == null) row[name] = 0;
      }
      row.Other = Math.round(other * 100) / 100;
      return row;
    });

    const discHasOther = reportCategoryTrends.some(
      (r) => typeof r.Other === "number" && (r.Other as number) > 0,
    );
    reportCategoryKeys = discHasOther
      ? [...discTop.filter((c) => c !== "Other"), "Other"]
      : discTop.filter((c) => c !== "Other");
    if (!discHasOther) {
      for (const row of reportCategoryTrends) {
        delete row.Other;
      }
    }
  }

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
      income: round2(incomeTotal),
      spend: round2(totalSpend),
      savings,
      savingsRate:
        incomeTotal > 0
          ? Math.round((savings / incomeTotal) * 1000) / 10
          : null,
      fixed: flexibility.fixed,
      discretionary: flexibility.discretionary,
      discretionaryShare:
        totalSpend > 0
          ? Math.round((flexibility.discretionary / totalSpend) * 1000) / 10
          : null,
    },
    categoryTrends: {
      months: reportCategoryTrends,
      keys: reportCategoryKeys,
    },
    flexibilityTrends,
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
export { excludeNonSpendCategory };

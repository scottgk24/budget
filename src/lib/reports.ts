import {
  eachDayOfInterval,
  endOfMonth,
  format,
  startOfMonth,
} from "date-fns";
import {
  defaultFundSlugForCategoryName,
  excludeNonSpendCategory,
  fundKindForSlug,
  isIncomeAmount,
  isSpendAmount,
  merchantRuleKey,
} from "@/lib/categories";
import { computeAgeOfMoney } from "@/lib/age-of-money";
import {
  buildCategoryMonthSeries,
  toStackedSpendRows,
} from "@/lib/category-month-series";
import { prisma } from "@/lib/db";
import {
  metricsRange,
  monthKeysInRange,
  yearFromPeriod,
  type MetricsRangeId,
} from "@/lib/format";
import type { SpendPacePoint } from "@/lib/report-types";
import type { Ledger } from "@/lib/types";

function spendBucket(
  categoryName: string | null | undefined,
): "committed" | "flexible" | "reserve" {
  const kind = fundKindForSlug(defaultFundSlugForCategoryName(categoryName));
  if (kind === "committed") return "committed";
  if (kind === "reserve") return "reserve";
  return "flexible";
}

type SankeyNode = { name: string };
type SankeyLink = { source: number; target: number; value: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

export type MerchantRollup = {
  merchant: string;
  amount: number;
  count: number;
  categoryName: string | null;
};

export function aggregateMerchants(
  txs: Array<{
    amount: number;
    name: string;
    merchantName: string | null;
    categoryName?: string | null;
  }>,
  limit?: number,
): MerchantRollup[] {
  const merchantMap = new Map<string, MerchantRollup>();
  for (const tx of txs) {
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
        categoryName: tx.categoryName ?? null,
      });
    }
  }
  const rows = [...merchantMap.values()]
    .map((m) => ({ ...m, amount: round2(m.amount) }))
    .sort((a, b) => b.amount - a.amount);
  return limit != null ? rows.slice(0, limit) : rows;
}

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

  // Personal: Committed / Flexible / Reserves, then categories.
  const byBucket = new Map<
    "committed" | "flexible" | "reserve",
    Array<{ name: string; value: number }>
  >([
    ["committed", []],
    ["flexible", []],
    ["reserve", []],
  ]);
  for (const [name, value] of spendByCat) {
    byBucket.get(spendBucket(name))!.push({ name, value });
  }
  const committedFlows = trimFlows(byBucket.get("committed")!, 6, 0.04);
  const flexibleFlows = trimFlows(byBucket.get("flexible")!, 7, 0.04);
  const reserveFlows = trimFlows(byBucket.get("reserve")!, 5, 0.04);
  const committedTotal = round2(committedFlows.reduce((s, f) => s + f.value, 0));
  const flexibleTotal = round2(flexibleFlows.reduce((s, f) => s + f.value, 0));
  const reserveTotal = round2(reserveFlows.reduce((s, f) => s + f.value, 0));

  const incomeIdx =
    incomeTotal > 0 || surplus > 0 || committedTotal + flexibleTotal + reserveTotal === 0
      ? addNode(incomeLabel)
      : -1;
  const savingsSourceIdx =
    deficit > 0 && totalSpend > 0 ? addNode(savingsLabel) : -1;

  const committedIdx = committedTotal > 0 ? addNode("Committed") : -1;
  const flexibleIdx = flexibleTotal > 0 ? addNode("Flexible") : -1;
  const reserveIdx = reserveTotal > 0 ? addNode("Reserves") : -1;

  if (deficit > 0) {
    const incomeLeft = { value: incomeTotal };
    fundFromIncomeThenSavings(
      committedIdx,
      committedTotal,
      incomeIdx,
      savingsSourceIdx,
      incomeLeft,
    );
    fundFromIncomeThenSavings(
      flexibleIdx,
      flexibleTotal,
      incomeIdx,
      savingsSourceIdx,
      incomeLeft,
    );
    fundFromIncomeThenSavings(
      reserveIdx,
      reserveTotal,
      incomeIdx,
      savingsSourceIdx,
      incomeLeft,
    );
  } else if (incomeIdx >= 0) {
    if (committedIdx >= 0) {
      links.push({ source: incomeIdx, target: committedIdx, value: committedTotal });
    }
    if (flexibleIdx >= 0) {
      links.push({ source: incomeIdx, target: flexibleIdx, value: flexibleTotal });
    }
    if (reserveIdx >= 0) {
      links.push({ source: incomeIdx, target: reserveIdx, value: reserveTotal });
    }
  }

  const linkCats = (
    middleIdx: number,
    flows: Array<{ name: string; value: number }>,
    otherLabel: string,
  ) => {
    if (middleIdx < 0) return;
    for (const { name, value } of flows) {
      if (value <= 0) continue;
      const label =
        name === "Committed" || name === "Flexible" || name === "Reserves"
          ? `${otherLabel} (other)`
          : name;
      links.push({ source: middleIdx, target: addNode(label), value });
    }
  };

  linkCats(committedIdx, committedFlows, "Committed");
  linkCats(flexibleIdx, flexibleFlows, "Flexible");
  linkCats(reserveIdx, reserveFlows, "Reserves");

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
): { fixed: number; discretionary: number; reserve: number } {
  let fixed = 0;
  let discretionary = 0;
  let reserve = 0;
  for (const [name, value] of spendByCat) {
    const bucket = spendBucket(name);
    if (bucket === "committed") fixed += value;
    else if (bucket === "reserve") reserve += value;
    else discretionary += value;
  }
  return { fixed: round2(fixed), discretionary: round2(discretionary), reserve: round2(reserve) };
}

export async function buildSpendPace(params: {
  workspaceId: string;
  ledger: Ledger;
  month: string;
  budgetTotal: number;
  spentToDate: number;
  fundKind?: "all" | "flexible" | "committed" | "reserve";
  flexibility?: "all" | "discretionary" | "fixed";
}) {
  const { workspaceId, ledger, month, budgetTotal } = params;
  const fundKind =
    params.fundKind ??
    (params.flexibility === "discretionary"
      ? "flexible"
      : params.flexibility === "fixed"
        ? "committed"
        : "all");
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
    },
    select: {
      amount: true,
      date: true,
      fund: { select: { kind: true, slug: true } },
      category: { select: { name: true } },
    },
    orderBy: { date: "asc" },
  });

  const spendByDay = new Map<string, number>();
  for (const tx of txs) {
    if (!isSpendAmount(tx.amount, tx.category?.name)) continue;
    if (fundKind !== "all" && ledger === "personal") {
      const kind =
        (tx.fund?.kind as "committed" | "flexible" | "reserve" | "buffer" | undefined) ??
        spendBucket(tx.category?.name);
      if (kind !== fundKind) continue;
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

  const months = monthKeysInRange(start, end);
  const yearKeys = [...new Set(months.map(yearFromPeriod))];

  const [txs, categories, budgets] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        workspaceId,
        ledger,
        pending: false,
        date: { gte: start, lte: end },
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.category.findMany({
      where: { workspaceId, ledger },
      select: { id: true, name: true, budgetPeriod: true },
    }),
    prisma.budget.findMany({
      where: {
        workspaceId,
        ledger,
        month: { in: [...months, ...yearKeys] },
      },
      select: { categoryId: true, month: true, amount: true },
    }),
  ]);

  const categorySeries = buildCategoryMonthSeries({
    months,
    categories,
    transactions: txs.map((tx) => ({
      date: tx.date,
      amount: tx.amount,
      categoryId: tx.categoryId,
      categoryName: tx.category?.name ?? null,
    })),
    budgets,
  });

  const stacked = toStackedSpendRows(categorySeries, {
    topN: 8,
    include:
      ledger === "personal"
        ? (s) => spendBucket(s.name) === "flexible"
        : undefined,
  });

  // --- Merchants ---
  const merchants = aggregateMerchants(
    txs
      .filter((tx) => isSpendAmount(tx.amount, tx.category?.name))
      .map((tx) => ({
        amount: tx.amount,
        name: tx.name,
        merchantName: tx.merchantName,
        categoryName: tx.category?.name ?? null,
      })),
    15,
  );

  // --- Sankey + flexibility totals ---
  let incomeTotal = 0;
  const spendByCat = new Map<string, number>();
  for (const tx of txs) {
    if (isIncomeAmount(tx.amount, tx.category?.name)) {
      incomeTotal += Math.abs(tx.amount);
      continue;
    }
    if (!isSpendAmount(tx.amount, tx.category?.name)) continue;
    const name = tx.category?.name ?? "Uncategorized";
    spendByCat.set(name, (spendByCat.get(name) ?? 0) + tx.amount);
  }

  const totalSpend = [...spendByCat.values()].reduce((a, b) => a + b, 0);
  const savings = round2(incomeTotal - totalSpend);
  const flexibility =
    ledger === "personal"
      ? sumSpendByFlexibility(spendByCat)
      : { fixed: 0, discretionary: round2(totalSpend), reserve: 0 };
  const { nodes: sankeyNodes, links: sankeyLinks } = buildCashFlowSankey({
    ledger,
    incomeTotal,
    spendByCat,
  });

  const flexibilityTrends =
    ledger === "personal"
      ? months.map((m, i) => {
          let committed = 0;
          let flexible = 0;
          let reserve = 0;
          for (const series of Object.values(categorySeries.byCategoryId)) {
            const spent = series.points[i]?.spent ?? 0;
            const bucket = spendBucket(series.name);
            if (bucket === "committed") committed += spent;
            else if (bucket === "reserve") reserve += spent;
            else flexible += spent;
          }
          return {
            key: m,
            label: format(new Date(`${m}-01T12:00:00`), "MMM yy"),
            Committed: round2(committed),
            Flexible: round2(flexible),
            Reserves: round2(reserve),
            Fixed: round2(committed),
            Discretionary: round2(flexible),
          };
        })
      : [];

  // --- Age of money ---
  const age = computeAgeOfMoney(
    txs.map((tx) => ({
      amount: tx.amount,
      date: tx.date,
      categoryName: tx.category?.name ?? null,
    })),
  );

  // Income breakdown by merchant/source (same keying as Top merchants)
  const incomeSources = new Map<string, { name: string; amount: number }>();
  for (const tx of txs) {
    if (!isIncomeAmount(tx.amount, tx.category?.name)) continue;
    const raw = (tx.merchantName || tx.name).trim() || "Income";
    const key = merchantRuleKey(raw) || raw.toLowerCase().slice(0, 40);
    const existing = incomeSources.get(key);
    const amount = Math.abs(tx.amount);
    if (existing) {
      existing.amount += amount;
      // Prefer a shorter display label when later deposits append IDs/refs.
      if (raw.length < existing.name.length) existing.name = raw;
    } else {
      incomeSources.set(key, { name: raw, amount });
    }
  }
  const incomeBreakdown = [...incomeSources.values()]
    .map((row) => ({
      name: row.name,
      amount: Math.round(row.amount * 100) / 100,
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
      reserve: flexibility.reserve,
      discretionaryShare:
        totalSpend > 0
          ? Math.round((flexibility.discretionary / totalSpend) * 1000) / 10
          : null,
    },
    categorySeries,
    categoryTrends: {
      months: stacked.months,
      keys: stacked.keys,
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

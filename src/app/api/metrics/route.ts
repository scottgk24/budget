import { NextResponse } from "next/server";
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachYearOfInterval,
} from "date-fns";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { sumNetBalances } from "@/lib/accounts";
import { isIncomeAmount, isSpendAmount, defaultFundSlugForCategoryName, fundKindForSlug } from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  type MetricsGranularity,
  metricsBucketKey,
  metricsRange,
  parseMetricsRangeId,
  periodBounds,
} from "@/lib/format";

type Bucket = {
  key: string;
  label: string;
  spend: number;
  fixedSpend: number;
  discretionarySpend: number;
  reserveSpend: number;
  income: number;
  savings: number;
  balance: number;
};

function parseGranularity(raw: string | null): MetricsGranularity {
  if (raw === "daily" || raw === "weekly" || raw === "yearly") return raw;
  return "monthly";
}

function emptyBuckets(start: Date, end: Date, granularity: MetricsGranularity): Bucket[] {
  const dates =
    granularity === "daily"
      ? eachDayOfInterval({ start, end })
      : granularity === "weekly"
        ? eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
        : granularity === "monthly"
          ? eachMonthOfInterval({ start, end })
          : eachYearOfInterval({ start, end });

  return dates.map((d) => {
    const key = metricsBucketKey(d, granularity);
    return {
      key,
      label: periodBounds(key, granularity).label,
      spend: 0,
      fixedSpend: 0,
      discretionarySpend: 0,
      reserveSpend: 0,
      income: 0,
      savings: 0,
      balance: 0,
    };
  });
}

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as "personal" | "business") || "personal";
    const granularity = parseGranularity(searchParams.get("granularity"));
    const rangeId = parseMetricsRangeId(searchParams.get("range"));

    let earliestData: Date | null = null;
    if (rangeId === "all") {
      const first = await prisma.transaction.findFirst({
        where: { workspaceId: workspace.id, ledger, pending: false },
        orderBy: { date: "asc" },
        select: { date: true },
      });
      earliestData = first?.date ?? null;
    }

    const { start, end } = metricsRange(rangeId, new Date(), earliestData);

    const [transactions, accounts] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          workspaceId: workspace.id,
          ledger,
          date: { gte: start, lte: end },
          pending: false,
        },
        select: {
          date: true,
          amount: true,
          fund: { select: { kind: true, slug: true } },
          category: { select: { name: true } },
        },
      }),
      prisma.account.findMany({
        where: { workspaceId: workspace.id, ledger, isHidden: false },
        select: { type: true, currentBalance: true },
      }),
    ]);

    const currentBalance = sumNetBalances(accounts);

    const buckets = emptyBuckets(start, end, granularity);
    const index = new Map(buckets.map((b, i) => [b.key, i]));

    // Plaid: positive amount decreases account balance. Net cashflow = -amount.
    const netByBucket = new Map<string, number>();
    let windowAmountSum = 0;

    for (const tx of transactions) {
      const key = metricsBucketKey(tx.date, granularity);
      const i = index.get(key);
      if (i == null) continue;

      windowAmountSum += tx.amount;
      netByBucket.set(key, (netByBucket.get(key) ?? 0) - tx.amount);

      const categoryName = tx.category?.name;
      if (isSpendAmount(tx.amount, categoryName)) {
        buckets[i].spend += tx.amount;
        if (ledger === "personal") {
          const kind =
            (tx.fund?.kind as string | undefined) ??
            fundKindForSlug(defaultFundSlugForCategoryName(categoryName));
          if (kind === "committed") buckets[i].fixedSpend += tx.amount;
          else if (kind === "reserve") buckets[i].reserveSpend += tx.amount;
          else buckets[i].discretionarySpend += tx.amount;
        } else {
          buckets[i].discretionarySpend += tx.amount;
        }
      } else if (isIncomeAmount(tx.amount, categoryName)) {
        buckets[i].income += Math.abs(tx.amount);
      }
    }

    for (const b of buckets) {
      b.savings = b.income - b.spend;
    }

    // Reconstruct end-of-bucket balances from today's total + synced txs.
    let running = currentBalance + windowAmountSum;
    for (const b of buckets) {
      running += netByBucket.get(b.key) ?? 0;
      b.balance = running;
    }

    const totals = buckets.reduce(
      (acc, b) => ({
        spend: acc.spend + b.spend,
        fixedSpend: acc.fixedSpend + b.fixedSpend,
        discretionarySpend: acc.discretionarySpend + b.discretionarySpend,
        reserveSpend: acc.reserveSpend + b.reserveSpend,
        income: acc.income + b.income,
        savings: acc.savings + b.savings,
      }),
      { spend: 0, fixedSpend: 0, discretionarySpend: 0, reserveSpend: 0, income: 0, savings: 0 },
    );

    const savingsRate =
      totals.income > 0 ? (totals.savings / totals.income) * 100 : null;

    return NextResponse.json({
      ledger,
      granularity,
      range: rangeId,
      start: start.toISOString(),
      end: end.toISOString(),
      series: buckets,
      totals: {
        ...totals,
        savingsRate,
        balance: currentBalance,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("metrics", err);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}

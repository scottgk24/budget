import { NextResponse } from "next/server";
import {
  eachDayOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  format,
  parseISO,
} from "date-fns";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  type MetricsGranularity,
  metricsRange,
} from "@/lib/format";

type Bucket = { key: string; label: string; spend: number; income: number; savings: number };

function bucketKey(date: Date, granularity: MetricsGranularity): string {
  if (granularity === "daily") return format(date, "yyyy-MM-dd");
  if (granularity === "monthly") return format(date, "yyyy-MM");
  return format(date, "yyyy");
}

function bucketLabel(key: string, granularity: MetricsGranularity): string {
  if (granularity === "daily") return format(parseISO(key), "MMM d");
  if (granularity === "monthly") return format(parseISO(`${key}-01`), "MMM yyyy");
  return key;
}

function emptyBuckets(start: Date, end: Date, granularity: MetricsGranularity): Bucket[] {
  const dates =
    granularity === "daily"
      ? eachDayOfInterval({ start, end })
      : granularity === "monthly"
        ? eachMonthOfInterval({ start, end })
        : eachYearOfInterval({ start, end });

  return dates.map((d) => {
    const key = bucketKey(d, granularity);
    return { key, label: bucketLabel(key, granularity), spend: 0, income: 0, savings: 0 };
  });
}

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as "personal" | "business") || "personal";
    const raw = searchParams.get("granularity") || "monthly";
    const granularity: MetricsGranularity =
      raw === "daily" || raw === "yearly" ? raw : "monthly";

    const { start, end } = metricsRange(granularity);

    const transactions = await prisma.transaction.findMany({
      where: {
        workspaceId: workspace.id,
        ledger,
        date: { gte: start, lte: end },
        pending: false,
      },
      select: { date: true, amount: true },
    });

    const buckets = emptyBuckets(start, end, granularity);
    const index = new Map(buckets.map((b, i) => [b.key, i]));

    for (const tx of transactions) {
      const key = bucketKey(tx.date, granularity);
      const i = index.get(key);
      if (i == null) continue;
      if (tx.amount > 0) buckets[i].spend += tx.amount;
      else if (tx.amount < 0) buckets[i].income += Math.abs(tx.amount);
    }

    for (const b of buckets) {
      b.savings = b.income - b.spend;
    }

    const totals = buckets.reduce(
      (acc, b) => ({
        spend: acc.spend + b.spend,
        income: acc.income + b.income,
        savings: acc.savings + b.savings,
      }),
      { spend: 0, income: 0, savings: 0 },
    );

    const savingsRate =
      totals.income > 0 ? (totals.savings / totals.income) * 100 : null;

    return NextResponse.json({
      ledger,
      granularity,
      start: start.toISOString(),
      end: end.toISOString(),
      series: buckets,
      totals: { ...totals, savingsRate },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("metrics", err);
    return NextResponse.json({ error: "Failed to load metrics" }, { status: 500 });
  }
}

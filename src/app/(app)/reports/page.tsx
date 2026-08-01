"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLedger } from "@/components/ledger-context";
import { useMoneyFormat } from "@/components/privacy-context";
import { useAppBasePath } from "@/components/use-app-base-path";
import { Card, PageHeader, Select } from "@/components/ui";
import {
  METRICS_RANGES,
  parseMetricsRangeId,
  type MetricsRangeId,
} from "@/lib/format";
import { ledgerCopy, ledgerLabel } from "@/lib/ledger-copy";

const chartFallback = (
  <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
    Loading charts…
  </p>
);

const CategoryTrendsChart = dynamic(
  () => import("@/components/report-charts").then((m) => m.CategoryTrendsChart),
  { ssr: false, loading: () => chartFallback },
);
const MerchantBarChart = dynamic(
  () => import("@/components/report-charts").then((m) => m.MerchantBarChart),
  { ssr: false, loading: () => chartFallback },
);
const CashFlowSankey = dynamic(
  () => import("@/components/report-charts").then((m) => m.CashFlowSankey),
  { ssr: false, loading: () => chartFallback },
);
const AgeOfMoneyChart = dynamic(
  () => import("@/components/report-charts").then((m) => m.AgeOfMoneyChart),
  { ssr: false, loading: () => chartFallback },
);

type ReportsData = {
  totals: {
    income: number;
    spend: number;
    savings: number;
    savingsRate: number | null;
  };
  categoryTrends: {
    months: Array<Record<string, string | number>>;
    keys: string[];
  };
  merchants: Array<{
    merchant: string;
    amount: number;
    count: number;
    categoryName: string | null;
  }>;
  sankey: {
    nodes: Array<{ name: string }>;
    links: Array<{ source: number; target: number; value: number }>;
  };
  ageOfMoney: {
    ageDays: number | null;
    series: Array<{ date: string; ageDays: number }>;
  };
  incomeBreakdown: Array<{ name: string; amount: number }>;
};

export default function ReportsPage() {
  const { ledger } = useLedger();
  const { href: appHref } = useAppBasePath();
  const copy = ledgerCopy(ledger);
  const { formatCurrency } = useMoneyFormat();
  const [rangeId, setRangeId] = useState<MetricsRangeId>("6m");
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?ledger=${ledger}&range=${rangeId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [ledger, rangeId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`${ledgerLabel(ledger)} · spending trends, cash flow, and merchants`}
        actions={
          <Select
            aria-label="Report timespan"
            value={rangeId}
            onChange={(e) => setRangeId(parseMetricsRangeId(e.target.value))}
          >
            {METRICS_RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        }
      />

      {error ? (
        <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {loading && !data ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.income}</p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(data.totals.income)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.spend}</p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(data.totals.spend)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {copy.savings}
                {data.totals.savingsRate != null
                  ? copy.savingsRateSuffix(data.totals.savingsRate)
                  : ""}
              </p>
              <p
                className={`mt-2 font-display text-2xl ${
                  data.totals.savings >= 0
                    ? "text-[var(--positive)]"
                    : "text-[var(--danger)]"
                }`}
              >
                {formatCurrency(data.totals.savings)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Age of money</p>
              <p className="mt-2 font-display text-2xl">
                {data.ageOfMoney.ageDays == null
                  ? "—"
                  : `${data.ageOfMoney.ageDays.toFixed(0)}d`}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Avg days between earning and spending
              </p>
            </Card>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            <Link href={appHref("/recurring")} className="text-[var(--accent)]">
              Recurring bills →
            </Link>
            <span className="text-[var(--border)]">·</span>
            <Link href={appHref("/goals")} className="text-[var(--accent)]">
              Goals →
            </Link>
          </div>

          <Card className="mt-6">
            <h2 className="mb-1 font-display text-lg">Cash flow</h2>
            <p className="mb-4 text-sm text-[var(--muted)]">
              How income flows into spending categories
            </p>
            {loading ? chartFallback : (
              <CashFlowSankey
                nodes={data.sankey.nodes}
                links={data.sankey.links}
              />
            )}
          </Card>

          <Card className="mt-6">
            <h2 className="mb-1 font-display text-lg">Spending by category</h2>
            <p className="mb-4 text-sm text-[var(--muted)]">
              Month-over-month trends for top categories
            </p>
            {loading ? chartFallback : (
              <CategoryTrendsChart
                data={data.categoryTrends.months}
                keys={data.categoryTrends.keys}
              />
            )}
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-1 font-display text-lg">Top merchants</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Where the money actually went
              </p>
              {loading ? chartFallback : (
                <MerchantBarChart data={data.merchants} />
              )}
            </Card>
            <Card>
              <h2 className="mb-1 font-display text-lg">Age of money</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Higher means a larger buffer between paychecks and spending
              </p>
              {loading ? chartFallback : (
                <AgeOfMoneyChart series={data.ageOfMoney.series} />
              )}
            </Card>
          </div>

          {data.incomeBreakdown.length > 0 ? (
            <Card className="mt-6">
              <h2 className="mb-4 font-display text-lg">Income sources</h2>
              <ul className="divide-y divide-[var(--border)]">
                {data.incomeBreakdown.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span>{row.name}</span>
                    <span className="tabular-nums text-[var(--positive)]">
                      {formatCurrency(row.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

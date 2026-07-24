"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLedger } from "@/components/ledger-context";
import { BalanceChart, SavingsChart, SpendIncomeChart, type MetricsPoint } from "@/components/metrics-charts";
import { PeriodDrilldown } from "@/components/period-drilldown";
import { Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import {
  formatCurrency,
  formatDate,
  formatSignedCurrency,
  METRICS_RANGES,
  monthKey,
  type MetricsGranularity,
  type MetricsRangeId,
  parseMetricsRangeId,
} from "@/lib/format";

type DashboardData = {
  month: string;
  totalBalance: number;
  accountCount: number;
  spent: number;
  income: number;
  budgetTotal: number;
  recent: Array<{
    id: string;
    name: string;
    amount: number;
    date: string;
    merchantName: string | null;
    category: { name: string } | null;
  }>;
  categorySpend: Array<{
    name: string;
    spent: number;
    budget: number | null;
  }>;
  holdings: Array<{
    id: string;
    name: string;
    symbol: string | null;
    value: number | null;
    quantity: number;
  }>;
};

type MetricsData = {
  granularity: MetricsGranularity;
  range: MetricsRangeId;
  series: MetricsPoint[];
  totals: {
    spend: number;
    income: number;
    savings: number;
    savingsRate: number | null;
    balance?: number;
  };
};

const PERIODS: Array<{ id: MetricsGranularity; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export default function DashboardPage() {
  const { ledger } = useLedger();
  const [data, setData] = useState<DashboardData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [granularity, setGranularity] = useState<MetricsGranularity>("monthly");
  const [rangeId, setRangeId] = useState<MetricsRangeId>("3m");
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?ledger=${ledger}&month=${monthKey()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [ledger]);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch(
        `/api/metrics?ledger=${ledger}&granularity=${granularity}&range=${rangeId}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load metrics");
      setMetrics(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    } finally {
      setMetricsLoading(false);
    }
  }, [ledger, granularity, rangeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    setSelectedPeriodKey(null);
  }, [ledger, granularity, rangeId]);

  const remaining =
    data && data.budgetTotal > 0 ? data.budgetTotal - data.spent : null;
  const rangeLabel =
    METRICS_RANGES.find((r) => r.id === rangeId)?.label ?? "3 months";
  const bucketLabel =
    PERIODS.find((p) => p.id === granularity)?.label.toLowerCase() ?? "month";

  function selectPeriod(point: MetricsPoint) {
    setSelectedPeriodKey(point.key);
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`${ledger === "personal" ? "Personal" : "Business"} · ${monthKey()}`}
      />

      {error ? (
        <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {loading && !data ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : data && data.accountCount === 0 ? (
        <EmptyState
          title="Connect your first account"
          description="Link Chase or Robinhood through Plaid to see balances and spending here."
          action={
            <Link
              href="/accounts"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white"
            >
              Go to Accounts
            </Link>
          }
        />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-[var(--muted)]">Balance</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
                {formatCurrency(data.totalBalance)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Spent this month</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
                {formatCurrency(data.spent)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Income this month</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
                {formatCurrency(data.income)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Budget remaining</p>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl">
                {remaining === null ? "—" : formatCurrency(remaining)}
              </p>
            </Card>
          </div>

          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-xl">
                  Spend & savings
                </h2>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {rangeLabel} · {bucketLabel} buckets · click a point to drill in
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Chart timespan"
                  value={rangeId}
                  onChange={(e) => setRangeId(parseMetricsRangeId(e.target.value))}
                  className="py-1.5"
                >
                  {METRICS_RANGES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </Select>
                <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5">
                  {PERIODS.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      variant={granularity === p.id ? "primary" : "ghost"}
                      className="px-3 py-1.5 text-xs"
                      onClick={() => setGranularity(p.id)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-[var(--muted)]">Spend</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-xl">
                  {metricsLoading && !metrics
                    ? "…"
                    : formatCurrency(metrics?.totals.spend ?? 0)}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--muted)]">Income</p>
                <p className="mt-2 font-[family-name:var(--font-display)] text-xl">
                  {metricsLoading && !metrics
                    ? "…"
                    : formatCurrency(metrics?.totals.income ?? 0)}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--muted)]">
                  Savings
                  {metrics?.totals.savingsRate != null
                    ? ` · ${metrics.totals.savingsRate.toFixed(0)}% rate`
                    : ""}
                </p>
                <p
                  className={`mt-2 font-[family-name:var(--font-display)] text-xl ${
                    (metrics?.totals.savings ?? 0) >= 0
                      ? "text-[var(--positive)]"
                      : "text-[var(--danger)]"
                  }`}
                >
                  {metricsLoading && !metrics
                    ? "…"
                    : formatCurrency(metrics?.totals.savings ?? 0)}
                </p>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <h3 className="mb-3 font-[family-name:var(--font-display)] text-lg">
                  Income vs spend
                </h3>
                {metricsLoading && !metrics ? (
                  <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                    Loading charts…
                  </p>
                ) : (
                  <SpendIncomeChart
                    data={metrics?.series ?? []}
                    onSelectPeriod={selectPeriod}
                    selectedKey={selectedPeriodKey}
                  />
                )}
              </Card>
              <Card>
                <h3 className="mb-3 font-[family-name:var(--font-display)] text-lg">
                  Net savings
                </h3>
                {metricsLoading && !metrics ? (
                  <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                    Loading charts…
                  </p>
                ) : (
                  <SavingsChart
                    data={metrics?.series ?? []}
                    onSelectPeriod={selectPeriod}
                    selectedKey={selectedPeriodKey}
                  />
                )}
              </Card>
            </div>

            <Card className="mt-6">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-lg">
                    Account balance over time
                  </h3>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    Reconstructed from current balances and synced transactions
                  </p>
                </div>
                <p className="text-sm tabular-nums text-[var(--muted)]">
                  Now{" "}
                  {metricsLoading && !metrics
                    ? "…"
                    : formatCurrency(metrics?.totals.balance ?? data.totalBalance)}
                </p>
              </div>
              {metricsLoading && !metrics ? (
                <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                  Loading charts…
                </p>
              ) : (
                <BalanceChart
                  data={metrics?.series ?? []}
                  onSelectPeriod={selectPeriod}
                  selectedKey={selectedPeriodKey}
                />
              )}
            </Card>
          </section>

          <PeriodDrilldown
            open={selectedPeriodKey != null}
            onClose={() => setSelectedPeriodKey(null)}
            ledger={ledger}
            granularity={granularity}
            periodKey={selectedPeriodKey}
          />

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-display)] text-lg">
                  Top categories
                </h2>
                <Link href="/budgets" className="text-sm text-[var(--accent)]">
                  Budgets
                </Link>
              </div>
              {data.categorySpend.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No spending yet this month.</p>
              ) : (
                <ul className="space-y-3">
                  {data.categorySpend.map((row) => {
                    const pct =
                      row.budget && row.budget > 0
                        ? Math.min(100, (row.spent / row.budget) * 100)
                        : null;
                    return (
                      <li key={row.name}>
                        <div className="flex items-center justify-between text-sm">
                          <span>{row.name}</span>
                          <span className="text-[var(--muted)]">
                            {formatCurrency(row.spent)}
                            {row.budget != null ? ` / ${formatCurrency(row.budget)}` : ""}
                          </span>
                        </div>
                        {pct != null ? (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-display)] text-lg">
                  Recent activity
                </h2>
                <Link href="/transactions" className="text-sm text-[var(--accent)]">
                  All
                </Link>
              </div>
              {data.recent.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No transactions yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {data.recent.map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <p className="font-medium">{tx.merchantName || tx.name}</p>
                        <p className="text-[var(--muted)]">
                          {formatDate(tx.date)}
                          {tx.category ? ` · ${tx.category.name}` : ""}
                        </p>
                      </div>
                      <span
                        className={
                          tx.amount > 0 ? "text-[var(--fg)]" : "text-[var(--positive)]"
                        }
                      >
                        {formatSignedCurrency(tx.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {data.holdings.length > 0 ? (
            <Card className="mt-6">
              <h2 className="mb-4 font-[family-name:var(--font-display)] text-lg">
                Holdings
              </h2>
              <ul className="divide-y divide-[var(--border)]">
                {data.holdings.map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        {h.symbol ? `${h.symbol} · ` : ""}
                        {h.name}
                      </p>
                      <p className="text-[var(--muted)]">{h.quantity} shares</p>
                    </div>
                    <span>{h.value != null ? formatCurrency(h.value) : "—"}</span>
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

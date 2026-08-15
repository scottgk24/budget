"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLedger } from "@/components/ledger-context";
import type { MetricsPoint } from "@/components/metrics-charts";
import { PeriodDrilldown } from "@/components/period-drilldown";
import { useMoneyFormat } from "@/components/privacy-context";
import { useAppBasePath } from "@/components/use-app-base-path";
import { Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import {
  formatDate,
  METRICS_RANGES,
  monthKey,
  type MetricsGranularity,
  type MetricsRangeId,
  parseMetricsRangeId,
} from "@/lib/format";
import { ledgerCopy, ledgerLabel } from "@/lib/ledger-copy";

const chartFallback = (
  <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
    Loading charts…
  </p>
);

const SpendIncomeChart = dynamic(
  () =>
    import("@/components/metrics-charts").then((m) => m.SpendIncomeChart),
  { ssr: false, loading: () => chartFallback },
);
const SavingsChart = dynamic(
  () => import("@/components/metrics-charts").then((m) => m.SavingsChart),
  { ssr: false, loading: () => chartFallback },
);
const BalanceChart = dynamic(
  () => import("@/components/metrics-charts").then((m) => m.BalanceChart),
  { ssr: false, loading: () => chartFallback },
);
const SpendPaceChart = dynamic(
  () => import("@/components/report-charts").then((m) => m.SpendPaceChart),
  { ssr: false, loading: () => chartFallback },
);
const CategoryPieChart = dynamic(
  () => import("@/components/budget-charts").then((m) => m.CategoryPieChart),
  { ssr: false, loading: () => chartFallback },
);

type DashboardData = {
  month: string;
  totalBalance: number;
  accountCount: number;
  spent: number;
  fixedSpend?: number | null;
  discretionarySpend?: number | null;
  reserveSpend?: number | null;
  fixedBudget?: number | null;
  discretionaryBudget?: number | null;
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
    budgetPeriod?: "monthly" | "annual";
    flexibility?: "fixed" | "discretionary" | null;
    fundKind?: "committed" | "flexible" | "reserve" | null;
  }>;
  holdings: Array<{
    id: string;
    name: string;
    symbol: string | null;
    value: number | null;
    quantity: number;
  }>;
  spendPace?: {
    series: Array<{
      day: number;
      label: string;
      actual: number | null;
      ideal: number;
      date: string;
    }>;
    freeToSpend: number | null;
    idealToDate: number;
    paceDelta: number | null;
    dayOfMonth: number;
    daysInMonth: number;
  };
  spendPaceScope?: "all" | "discretionary";
};

type MetricsData = {
  granularity: MetricsGranularity;
  range: MetricsRangeId;
  series: MetricsPoint[];
  totals: {
    spend: number;
    fixedSpend?: number;
    discretionarySpend?: number;
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
  const { href: appHref } = useAppBasePath();
  const copy = ledgerCopy(ledger);
  const { formatCurrency, formatSignedCurrency } = useMoneyFormat();
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
        title={copy.dashboardTitle}
        description={`${ledgerLabel(ledger)} · ${monthKey()}`}
      />

      {error ? (
        <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {loading && !data ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : data && data.accountCount === 0 ? (
        <EmptyState
          title={copy.emptyAccountsTitle}
          description={copy.emptyAccountsDescription}
          action={
            <Link
              href={appHref("/accounts")}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]"
            >
              Go to Accounts
            </Link>
          }
        />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.balance}</p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(data.totalBalance)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {ledger === "personal" ? "Flexible" : copy.spentThisMonth}
              </p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(
                  ledger === "personal"
                    ? (data.discretionarySpend ?? data.spent)
                    : data.spent,
                )}
              </p>
              {ledger === "personal" && data.fixedSpend != null ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Committed {formatCurrency(data.fixedSpend)}
                  {data.reserveSpend
                    ? ` · reserves ${formatCurrency(data.reserveSpend)}`
                    : ""}
                  {" · total "}
                  {formatCurrency(data.spent)}
                </p>
              ) : null}
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.incomeThisMonth}</p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(data.income)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {data.spendPace?.freeToSpend != null
                  ? data.spendPaceScope === "discretionary"
                    ? "Free to spend"
                    : "Free to spend"
                  : copy.budgetRemaining}
              </p>
              <p className="mt-2 font-display text-2xl">
                {data.spendPace?.freeToSpend != null
                  ? formatCurrency(data.spendPace.freeToSpend)
                  : remaining === null
                    ? "—"
                    : formatCurrency(remaining)}
              </p>
              {data.spendPace?.paceDelta != null ? (
                <p
                  className={`mt-1 text-xs ${
                    data.spendPace.paceDelta >= 0
                      ? "text-[var(--positive)]"
                      : "text-[var(--danger)]"
                  }`}
                >
                  {data.spendPace.paceDelta >= 0 ? "Under" : "Over"}{" "}
                  {data.spendPaceScope === "discretionary" ? "flexible " : ""}
                  pace by {formatCurrency(Math.abs(data.spendPace.paceDelta))}
                </p>
              ) : null}
            </Card>
          </div>

          {data.spendPace &&
          (data.spendPaceScope === "discretionary"
            ? (data.discretionaryBudget ?? 0) > 0
            : data.budgetTotal > 0) ? (
            <Card className="mt-6">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg">
                    {data.spendPaceScope === "discretionary"
                      ? "Flexible pace"
                      : "Spend pace"}
                  </h3>
                  <p className="text-sm text-[var(--muted)]">
                    {data.spendPaceScope === "discretionary"
                      ? "This month’s choices vs leftover after bills and sinking funds"
                      : "Actual cumulative spend vs ideal burn through the month"}
                  </p>
                </div>
              </div>
              <SpendPaceChart
                data={data.spendPace.series}
                budgetTotal={
                  data.spendPaceScope === "discretionary"
                    ? (data.discretionaryBudget ?? data.budgetTotal)
                    : data.budgetTotal
                }
              />
            </Card>
          ) : null}

          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-xl">
                  {copy.chartsSection}
                </h2>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {rangeLabel} · {bucketLabel}
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

            <div
              className={`mb-4 grid gap-4 ${
                ledger === "personal" ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
              }`}
            >
              {ledger === "personal" ? (
                <>
                  <Card>
                    <p className="text-sm text-[var(--muted)]">Flexible</p>
                    <p className="mt-2 font-display text-xl text-[var(--danger)]">
                      {metricsLoading && !metrics
                        ? "…"
                        : formatCurrency(metrics?.totals.discretionarySpend ?? 0)}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-sm text-[var(--muted)]">Committed</p>
                    <p className="mt-2 font-display text-xl">
                      {metricsLoading && !metrics
                        ? "…"
                        : formatCurrency(metrics?.totals.fixedSpend ?? 0)}
                    </p>
                  </Card>
                </>
              ) : (
                <Card>
                  <p className="text-sm text-[var(--muted)]">{copy.spend}</p>
                  <p className="mt-2 font-display text-xl">
                    {metricsLoading && !metrics
                      ? "…"
                      : formatCurrency(metrics?.totals.spend ?? 0)}
                  </p>
                </Card>
              )}
              <Card>
                <p className="text-sm text-[var(--muted)]">{copy.income}</p>
                <p className="mt-2 font-display text-xl">
                  {metricsLoading && !metrics
                    ? "…"
                    : formatCurrency(metrics?.totals.income ?? 0)}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--muted)]">
                  {copy.savings}
                  {metrics?.totals.savingsRate != null
                    ? copy.savingsRateSuffix(metrics.totals.savingsRate)
                    : ""}
                </p>
                <p
                  className={`mt-2 font-display text-xl ${
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
                <h3 className="mb-3 font-display text-lg">
                  {ledger === "personal"
                    ? "Income vs committed, flexible & reserves"
                    : copy.incomeVsSpend}
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
                    incomeLabel={copy.income}
                    spendLabel={copy.spend}
                    splitSpend={ledger === "personal"}
                  />
                )}
              </Card>
              <Card>
                <h3 className="mb-3 font-display text-lg">
                  {copy.netSavings}
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
                    savingsLabel={copy.savings}
                    emptyLabel={copy.noSavingsData}
                  />
                )}
              </Card>
            </div>

            <Card className="mt-6">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg">
                    {copy.accountBalance}
                  </h3>
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
                <h2 className="font-display text-lg">
                  {copy.topCategories}
                </h2>
                <Link href={appHref("/budgets")} className="text-sm text-[var(--accent)]">
                  {copy.budgetsLink}
                </Link>
              </div>
              {data.categorySpend.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No spending yet this month.</p>
              ) : (
                <ul className="space-y-3">
                  {data.categorySpend.map((row) => {
                    const annual = row.budgetPeriod === "annual";
                    const pct =
                      row.budget && row.budget > 0
                        ? Math.min(100, (row.spent / row.budget) * 100)
                        : null;
                    const barColor =
                      row.fundKind === "flexible"
                        ? "bg-[var(--danger)]"
                        : row.fundKind === "reserve"
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--accent)]";
                    return (
                      <li key={row.name}>
                        <div className="flex items-center justify-between text-sm">
                          <span>
                            {row.name}
                            {row.fundKind && ledger === "personal" ? (
                              <span className="ml-1.5 text-[11px] text-[var(--muted)]">
                                {row.fundKind === "flexible"
                                  ? "flex"
                                  : row.fundKind === "reserve"
                                    ? "reserve"
                                    : "committed"}
                              </span>
                            ) : null}
                            {annual ? (
                              <span className="ml-1.5 text-[11px] text-[var(--muted)]">
                                YTD
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[var(--muted)]">
                            {formatCurrency(row.spent)}
                            {row.budget != null ? ` / ${formatCurrency(row.budget)}` : ""}
                            {annual && row.budget != null ? (
                              <span className="text-[11px]"> /yr</span>
                            ) : null}
                          </span>
                        </div>
                        {pct != null ? (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
                            <div
                              className={`h-full rounded-full ${barColor}`}
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
                <h2 className="font-display text-lg">
                  Recent activity
                </h2>
                <Link href={appHref("/transactions")} className="text-sm text-[var(--accent)]">
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
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="mb-4 font-display text-lg">
                  {copy.holdings}
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
              <Card>
                <h2 className="mb-1 font-display text-lg">Allocation</h2>
                <p className="mb-4 text-sm text-[var(--muted)]">
                  Portfolio mix by holding value
                </p>
                <CategoryPieChart
                  data={data.holdings
                    .filter((h) => (h.value ?? 0) > 0)
                    .map((h) => ({
                      id: h.id,
                      name: h.symbol || h.name,
                      value: h.value ?? 0,
                    }))}
                  emptyLabel="No holding values yet"
                />
              </Card>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

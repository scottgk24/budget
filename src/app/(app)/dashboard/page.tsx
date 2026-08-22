"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLedgerGuard } from "@/components/ledger-context";
import type { MetricsPoint } from "@/components/metrics-charts";
import { PeriodDrilldown } from "@/components/period-drilldown";
import { useMoneyFormat } from "@/components/privacy-context";
import { useAppBasePath } from "@/components/use-app-base-path";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button, Card, EmptyState, PageHeader, Select } from "@/components/ui";
import { isCurrencyHolding } from "@/lib/holdings";
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
  cashBalance?: number;
  otherAssetBalance?: number;
  creditCardDebt?: number;
  accountCount: number;
  spent: number;
  fixedSpend?: number | null;
  discretionarySpend?: number | null;
  reserveSpend?: number | null;
  fixedBudget?: number | null;
  discretionaryBudget?: number | null;
  income: number;
  trailingIncomeAverage?: number;
  incomeIncomplete?: boolean;
  flexibleLeft?: number | null;
  flexibleOverspend?: number;
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
  topMerchants?: Array<{
    merchant: string;
    amount: number;
    count: number;
    categoryName: string | null;
  }>;
};

const PERIODS: Array<{ id: MetricsGranularity; label: string }> = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

export default function DashboardPage() {
  const { ledger, isCurrent } = useLedgerGuard();
  const { href: appHref } = useAppBasePath();
  const copy = ledgerCopy(ledger);
  const { formatCurrency, formatSignedCurrency } = useMoneyFormat();
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsLedger, setMetricsLedger] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<MetricsGranularity>("monthly");
  const [rangeId, setRangeId] = useState<MetricsRangeId>("3m");
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requested = ledger;
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?ledger=${requested}&month=${monthKey()}`);
      const json = await res.json();
      if (!isCurrent(requested)) return;
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
      setDataLedger(requested);
    } catch (err) {
      if (!isCurrent(requested)) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [ledger, isCurrent]);

  const loadMetrics = useCallback(async () => {
    const requested = ledger;
    try {
      const res = await fetch(
        `/api/metrics?ledger=${requested}&granularity=${granularity}&range=${rangeId}`,
      );
      const json = await res.json();
      if (!isCurrent(requested)) return;
      if (!res.ok) throw new Error(json.error ?? "Failed to load metrics");
      setMetrics(json);
      setMetricsLedger(requested);
    } catch (err) {
      if (!isCurrent(requested)) return;
      setError(err instanceof Error ? err.message : "Failed to load metrics");
    }
  }, [ledger, granularity, rangeId, isCurrent]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    setSelectedPeriodKey(null);
  }, [granularity, rangeId]);

  const view = dataLedger === ledger ? data : null;
  const metricsView = metricsLedger === ledger ? metrics : null;
  const remaining =
    view && view.budgetTotal > 0 ? view.budgetTotal - view.spent : null;
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

      {!view ? (
        <PageSkeleton label="Loading dashboard" />
      ) : view.accountCount === 0 ? (
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
      ) : (
        <>
          {ledger === "personal" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-[var(--muted)]">Cash</p>
                <p className="mt-2 font-display text-2xl">
                  {formatCurrency(view.cashBalance ?? 0)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Checking and savings
                  {(view.otherAssetBalance ?? 0) > 0
                    ? ` · also linked ${formatCurrency(view.otherAssetBalance ?? 0)}`
                    : ""}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--muted)]">Credit cards</p>
                <p className="mt-2 font-display text-2xl">
                  {formatCurrency(view.creditCardDebt ?? 0)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">Amount owed</p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--muted)]">Net</p>
                <p className="mt-2 font-display text-2xl">
                  {formatCurrency(view.totalBalance)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Linked accounts, cards subtracted
                </p>
              </Card>
            </div>
          ) : null}

          <div
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
              ledger === "personal" ? "mt-4" : ""
            }`}
          >
            {ledger === "business" ? (
              <Card>
                <p className="text-sm text-[var(--muted)]">{copy.balance}</p>
                <p className="mt-2 font-display text-2xl">
                  {formatCurrency(view.totalBalance)}
                </p>
              </Card>
            ) : null}
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {ledger === "personal" ? "Flexible" : copy.spentThisMonth}
              </p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(
                  ledger === "personal"
                    ? (view.discretionarySpend ?? view.spent)
                    : view.spent,
                )}
              </p>
              {ledger === "personal" && view.fixedSpend != null ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Committed {formatCurrency(view.fixedSpend)}
                  {view.reserveSpend
                    ? ` · reserves ${formatCurrency(view.reserveSpend)}`
                    : ""}
                  {" · total "}
                  {formatCurrency(view.spent)}
                </p>
              ) : null}
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.incomeThisMonth}</p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(view.income)}
              </p>
              {ledger === "personal" && view.incomeIncomplete ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Month incomplete — posted income is below the recent
                  {view.trailingIncomeAverage
                    ? ` ${formatCurrency(view.trailingIncomeAverage)}/mo`
                    : ""}{" "}
                  average. Another paycheck may still land.
                </p>
              ) : null}
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {view.spendPace?.freeToSpend != null
                  ? "Free to spend"
                  : copy.budgetRemaining}
              </p>
              <p
                className={`mt-2 font-display text-2xl ${
                  (view.flexibleOverspend ?? 0) > 0 ? "text-[var(--danger)]" : ""
                }`}
              >
                {view.spendPace?.freeToSpend != null
                  ? formatCurrency(view.spendPace.freeToSpend)
                  : remaining === null
                    ? "—"
                    : formatCurrency(remaining)}
              </p>
              {(view.flexibleOverspend ?? 0) > 0 ? (
                <p className="mt-1 text-xs text-[var(--danger)]">
                  Flexible over by {formatCurrency(view.flexibleOverspend ?? 0)}
                </p>
              ) : view.spendPace?.paceDelta != null ? (
                <p
                  className={`mt-1 text-xs ${
                    view.spendPace.paceDelta >= 0
                      ? "text-[var(--positive)]"
                      : "text-[var(--danger)]"
                  }`}
                >
                  {view.spendPace.paceDelta >= 0 ? "Under" : "Over"}{" "}
                  {view.spendPaceScope === "discretionary" ? "flexible " : ""}
                  pace by {formatCurrency(Math.abs(view.spendPace.paceDelta))}
                </p>
              ) : null}
            </Card>
          </div>

          {view.spendPace &&
          (view.spendPaceScope === "discretionary"
            ? (view.discretionaryBudget ?? 0) > 0
            : view.budgetTotal > 0) ? (
            <Card className="mt-6">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="font-display text-lg">
                    {view.spendPaceScope === "discretionary"
                      ? "Flexible pace"
                      : "Spend pace"}
                  </h3>
                  <p className="text-sm text-[var(--muted)]">
                    {view.spendPaceScope === "discretionary"
                      ? "This month’s choices vs leftover after bills and sinking funds"
                      : "Actual cumulative spend vs ideal burn through the month"}
                  </p>
                </div>
              </div>
              <SpendPaceChart
                data={view.spendPace.series}
                budgetTotal={
                  view.spendPaceScope === "discretionary"
                    ? (view.discretionaryBudget ?? view.budgetTotal)
                    : view.budgetTotal
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
                      {!metricsView
                        ? "…"
                        : formatCurrency(metricsView?.totals.discretionarySpend ?? 0)}
                    </p>
                  </Card>
                  <Card>
                    <p className="text-sm text-[var(--muted)]">Committed</p>
                    <p className="mt-2 font-display text-xl">
                      {!metricsView
                        ? "…"
                        : formatCurrency(metricsView?.totals.fixedSpend ?? 0)}
                    </p>
                  </Card>
                </>
              ) : (
                <Card>
                  <p className="text-sm text-[var(--muted)]">{copy.spend}</p>
                  <p className="mt-2 font-display text-xl">
                    {!metricsView
                      ? "…"
                      : formatCurrency(metricsView?.totals.spend ?? 0)}
                  </p>
                </Card>
              )}
              <Card>
                <p className="text-sm text-[var(--muted)]">{copy.income}</p>
                <p className="mt-2 font-display text-xl">
                  {!metricsView
                    ? "…"
                    : formatCurrency(metricsView?.totals.income ?? 0)}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--muted)]">
                  {copy.savings}
                  {metricsView?.totals.savingsRate != null
                    ? copy.savingsRateSuffix(metricsView.totals.savingsRate)
                    : ""}
                </p>
                <p
                  className={`mt-2 font-display text-xl ${
                    (metricsView?.totals.savings ?? 0) >= 0
                      ? "text-[var(--positive)]"
                      : "text-[var(--danger)]"
                  }`}
                >
                  {!metricsView
                    ? "…"
                    : formatCurrency(metricsView?.totals.savings ?? 0)}
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
                {!metricsView ? (
                  <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                    Loading charts…
                  </p>
                ) : (
                  <SpendIncomeChart
                    data={metricsView?.series ?? []}
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
                {!metricsView ? (
                  <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                    Loading charts…
                  </p>
                ) : (
                  <SavingsChart
                    data={metricsView?.series ?? []}
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
                  {!metricsView
                    ? "…"
                    : formatCurrency(metricsView?.totals.balance ?? view.totalBalance)}
                </p>
              </div>
              {!metricsView ? (
                <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                  Loading charts…
                </p>
              ) : (
                <BalanceChart
                  data={metricsView?.series ?? []}
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

          <div
            className={`mt-8 grid gap-6 ${
              ledger === "personal" && (metricsView?.topMerchants?.length ?? 0) > 0
                ? "lg:grid-cols-3"
                : "lg:grid-cols-2"
            }`}
          >
            {ledger === "personal" && (metricsView?.topMerchants?.length ?? 0) > 0 ? (
              <Card>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-lg">Top merchants</h2>
                  <Link href={appHref("/reports")} className="text-sm text-[var(--accent)]">
                    Reports
                  </Link>
                </div>
                <p className="mb-3 text-sm text-[var(--muted)]">
                  {rangeLabel}
                </p>
                <ul className="space-y-3">
                  {metricsView!.topMerchants!.map((row) => (
                    <li key={row.merchant}>
                      <Link
                        href={appHref(
                          `/transactions?merchant=${encodeURIComponent(row.merchant)}`,
                        )}
                        className="flex items-center justify-between text-sm hover:text-[var(--accent)]"
                      >
                        <span>
                          {row.merchant}
                          <span className="ml-1.5 text-[11px] text-[var(--muted)]">
                            {row.count} tx
                          </span>
                        </span>
                        <span className="tabular-nums text-[var(--muted)]">
                          {formatCurrency(row.amount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg">
                  {copy.topCategories}
                </h2>
                <Link href={appHref("/budgets")} className="text-sm text-[var(--accent)]">
                  {copy.budgetsLink}
                </Link>
              </div>
              {view.categorySpend.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No spending yet this month.</p>
              ) : (
                <ul className="space-y-3">
                  {view.categorySpend.map((row) => {
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
              {view.recent.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No transactions yet.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {view.recent.map((tx) => (
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

          {view.holdings.length > 0 ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card>
                <h2 className="mb-4 font-display text-lg">
                  {copy.holdings}
                </h2>
                <ul className="divide-y divide-[var(--border)]">
                  {view.holdings.map((h) => (
                    <li key={h.id} className="flex items-center justify-between py-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {h.symbol ? `${h.symbol} · ` : ""}
                          {h.name}
                        </p>
                        <p className="text-[var(--muted)]">
                          {isCurrencyHolding(h)
                            ? "Cash"
                            : `${h.quantity} shares`}
                        </p>
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
                  data={view.holdings
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
      )}
    </div>
  );
}

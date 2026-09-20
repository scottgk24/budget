"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLedgerGuard } from "@/components/ledger-context";
import { useMoneyFormat } from "@/components/privacy-context";
import { useAppBasePath } from "@/components/use-app-base-path";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDate, formatMonthLabel, monthKey } from "@/lib/format";
import { ledgerCopy, ledgerLabel } from "@/lib/ledger-copy";

const chartFallback = (
  <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
    Loading charts…
  </p>
);

const SpendPaceChart = dynamic(
  () => import("@/components/report-charts").then((m) => m.SpendPaceChart),
  { ssr: false, loading: () => chartFallback },
);

type DashboardData = {
  month: string;
  totalBalance: number;
  assets?: number;
  liabilities?: number;
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

export default function DashboardPage() {
  const { ledger, kind, isCurrent } = useLedgerGuard();
  const { href: appHref } = useAppBasePath();
  const copy = ledgerCopy(kind);
  const { formatCurrency, formatSignedCurrency } = useMoneyFormat();
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
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

  useEffect(() => {
    void load();
  }, [load]);

  const view = dataLedger === ledger ? data : null;
  const remaining =
    view && view.budgetTotal > 0 ? view.budgetTotal - view.spent : null;
  const monthLabel = formatMonthLabel(monthKey());

  return (
    <div>
      <PageHeader
        title={copy.dashboardTitle}
        description={`${ledgerLabel(ledger)} · ${monthLabel}`}
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
          {kind === "personal" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-[var(--muted)]">
                    Net worth
                    <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">
                      · {monthLabel}
                    </span>
                  </p>
                  <Link
                    href={appHref("/investments")}
                    className="text-xs text-[var(--accent)]"
                  >
                    Investments
                  </Link>
                </div>
                <p className="mt-2 font-display text-2xl">
                  {formatCurrency(view.totalBalance)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Assets {formatCurrency(view.assets ?? view.totalBalance)}
                  {(view.liabilities ?? 0) > 0.5
                    ? ` · debts ${formatCurrency(view.liabilities ?? 0)}`
                    : ""}
                </p>
              </Card>
              <Card>
                <p className="text-sm text-[var(--muted)]">Cash</p>
                <p className="mt-2 font-display text-2xl">
                  {formatCurrency(view.cashBalance ?? 0)}
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Bank and brokerage cash
                  {(view.otherAssetBalance ?? 0) > 0.5
                    ? ` · +${formatCurrency(view.otherAssetBalance ?? 0)} in other holdings`
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
            </div>
          ) : null}

          <div
            className={`grid gap-4 ${
              kind === "personal"
                ? "mt-4 sm:grid-cols-2"
                : "sm:grid-cols-2 lg:grid-cols-3"
            }`}
          >
            {ledger === "business" ? (
              <>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-[var(--muted)]">Net worth</p>
                    <Link
                      href={appHref("/investments")}
                      className="text-xs text-[var(--accent)]"
                    >
                      Investments
                    </Link>
                  </div>
                  <p className="mt-2 font-display text-2xl">
                    {formatCurrency(view.totalBalance)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Assets {formatCurrency(view.assets ?? view.totalBalance)}
                    {(view.liabilities ?? 0) > 0.5
                      ? ` · debts ${formatCurrency(view.liabilities ?? 0)}`
                      : ""}
                  </p>
                </Card>
                <Card>
                  <p className="text-sm text-[var(--muted)]">{copy.balance}</p>
                  <p className="mt-2 font-display text-2xl">
                    {formatCurrency(view.cashBalance ?? view.totalBalance)}
                  </p>
                </Card>
                <Card>
                  <p className="text-sm text-[var(--muted)]">{copy.spentThisMonth}</p>
                  <p className="mt-2 font-display text-2xl">
                    {formatCurrency(view.spent)}
                  </p>
                </Card>
              </>
            ) : null}

            <Card className={kind === "personal" ? "sm:col-span-1 ring-1 ring-[var(--accent)]/25" : undefined}>
              <p className="text-sm text-[var(--muted)]">
                {kind === "personal" && view.spendPace?.freeToSpend != null
                  ? "Flexible left"
                  : view.spendPace?.freeToSpend != null
                    ? "Free to spend"
                    : copy.budgetRemaining}
                <span className="ml-1.5 text-[11px] font-normal">· {monthLabel}</span>
              </p>
              <p
                className={`mt-2 font-display text-3xl ${
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
              {kind === "personal" && view.fixedSpend != null ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Spent this month {formatCurrency(view.spent)}
                  {view.discretionarySpend != null
                    ? ` · flexible ${formatCurrency(view.discretionarySpend)}`
                    : ""}
                  {view.fixedSpend
                    ? ` · committed ${formatCurrency(view.fixedSpend)}`
                    : ""}
                  {view.reserveSpend
                    ? ` · reserves ${formatCurrency(view.reserveSpend)}`
                    : ""}
                </p>
              ) : null}
            </Card>

            <Card>
              <p className="text-sm text-[var(--muted)]">
                {copy.incomeThisMonth}
                <span className="ml-1.5 text-[11px] font-normal">· {monthLabel}</span>
              </p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(view.income)}
              </p>
              {kind === "personal" && view.incomeIncomplete ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Month incomplete — posted income is below the recent
                  {view.trailingIncomeAverage
                    ? ` ${formatCurrency(view.trailingIncomeAverage)}/mo`
                    : ""}{" "}
                  average. Another paycheck may still land.
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
                <Link href={appHref("/reports")} className="text-sm text-[var(--accent)]">
                  Trends in Reports →
                </Link>
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
          ) : (
            <p className="mt-4 text-sm text-[var(--muted)]">
              <Link href={appHref("/reports")} className="text-[var(--accent)]">
                Open Reports
              </Link>{" "}
              for range trends and cash flow.
            </p>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg">
                  {copy.topCategories}
                  <span className="ml-2 text-sm font-sans font-normal text-[var(--muted)]">
                    · {monthLabel}
                  </span>
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
                        ? "bg-[var(--flexible)]"
                        : row.fundKind === "reserve"
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--accent)]";
                    return (
                      <li key={row.name}>
                        <div className="flex items-center justify-between text-sm">
                          <span>
                            {row.name}
                            {row.fundKind && kind === "personal" ? (
                              <span className="ml-1.5 text-[11px] text-[var(--muted)]">
                                {row.fundKind === "flexible"
                                  ? "flexible"
                                  : row.fundKind === "reserve"
                                    ? "reserve"
                                    : "committed"}
                              </span>
                            ) : null}
                            {annual ? (
                              <span className="ml-1.5 text-[11px] text-[var(--muted)]">
                                so far this year
                              </span>
                            ) : null}
                          </span>
                          <span className="text-[var(--muted)]">
                            {annual
                              ? `${formatCurrency(row.spent)}${
                                  row.budget != null
                                    ? ` / ${formatCurrency(row.budget)}/yr`
                                    : ""
                                }`
                              : `${formatCurrency(row.spent)}${
                                  row.budget != null
                                    ? ` / ${formatCurrency(row.budget)}`
                                    : ""
                                }`}
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
        </>
      )}
    </div>
  );
}

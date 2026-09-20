"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLedgerGuard } from "@/components/ledger-context";
import {
  BreakdownModal,
  type BreakdownTarget,
} from "@/components/period-drilldown";
import { useMoneyFormat } from "@/components/privacy-context";
import { useAppBasePath } from "@/components/use-app-base-path";
import { MerchantList } from "@/components/merchant-list";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, PageHeader, Select } from "@/components/ui";
import {
  isFlexibleCategoryName,
  type CategoryMonthSeriesRegistry,
} from "@/lib/category-month-series";
import {
  METRICS_RANGES,
  formatMonthLabel,
  monthRange,
  parseMetricsRangeId,
  toDateParam,
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
const CategorySpendVsBudgetChart = dynamic(
  () =>
    import("@/components/report-charts").then((m) => m.CategorySpendVsBudgetChart),
  { ssr: false, loading: () => chartFallback },
);
const CashFlowSankey = dynamic(
  () => import("@/components/report-charts").then((m) => m.CashFlowSankey),
  { ssr: false, loading: () => chartFallback },
);
const FlexibilityTrendsChart = dynamic(
  () =>
    import("@/components/report-charts").then((m) => m.FlexibilityTrendsChart),
  { ssr: false, loading: () => chartFallback },
);
const AgeOfMoneyChart = dynamic(
  () => import("@/components/report-charts").then((m) => m.AgeOfMoneyChart),
  { ssr: false, loading: () => chartFallback },
);

const CATEGORY_PICKER_SKIP = new Set(["Income", "Transfers", "Review"]);

type ReportsData = {
  start: string;
  end: string;
  totals: {
    income: number;
    spend: number;
    savings: number;
    savingsRate: number | null;
    fixed: number;
    discretionary: number;
    reserve?: number;
    discretionaryShare: number | null;
  };
  categorySeries: CategoryMonthSeriesRegistry;
  categoryTrends: {
    months: Array<Record<string, string | number>>;
    keys: string[];
  };
  flexibilityTrends: Array<{
    key: string;
    label: string;
    Committed?: number;
    Flexible?: number;
    Reserves?: number;
    Fixed?: number;
    Discretionary?: number;
    Income?: number;
  }>;
  merchants: Array<{
    merchant: string;
    amount: number;
    count: number;
    categoryName: string | null;
    fundKind?: "committed" | "flexible" | "reserve" | null;
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

function PeriodChip({ label }: { label: string }) {
  return (
    <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">
      · {label}
    </span>
  );
}

export default function ReportsPage() {
  const { ledger, kind, isCurrent } = useLedgerGuard();
  const { href: appHref } = useAppBasePath();
  const copy = ledgerCopy(kind);
  const { formatCurrency } = useMoneyFormat();
  const [rangeId, setRangeId] = useState<MetricsRangeId>("6m");
  const [data, setData] = useState<ReportsData | null>(null);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownTarget | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const requested = ledger;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports?ledger=${requested}&range=${rangeId}`);
      const json = await res.json();
      if (!isCurrent(requested)) return;
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
      setDataLedger(requested);
    } catch (err) {
      if (!isCurrent(requested)) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (isCurrent(requested)) setLoading(false);
    }
  }, [ledger, rangeId, isCurrent]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setBreakdown(null);
    setSelectedCategoryId(null);
  }, [ledger, rangeId]);

  const view = dataLedger === ledger ? data : null;
  const rangeFrom = view ? toDateParam(new Date(view.start)) : null;
  const rangeTo = view ? toDateParam(new Date(view.end)) : null;
  const rangeLabel =
    METRICS_RANGES.find((r) => r.id === rangeId)?.label ?? "Selected range";

  const categoryOptions = useMemo(() => {
    if (!view?.categorySeries) return [];
    return Object.values(view.categorySeries.byCategoryId)
      .filter((s) => !CATEGORY_PICKER_SKIP.has(s.name))
      .filter((s) => {
        const hasSpend = s.points.some((p) => p.spent !== 0);
        const hasBudget = s.points.some((p) => p.budget > 0);
        return hasSpend || hasBudget;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [view]);

  const defaultCategoryId = useMemo(() => {
    if (categoryOptions.length === 0) return null;
    const flexible = categoryOptions
      .filter((s) => isFlexibleCategoryName(s.name))
      .map((s) => ({
        id: s.categoryId,
        total: s.points.reduce((sum, p) => sum + p.spent, 0),
      }))
      .sort((a, b) => b.total - a.total);
    return flexible[0]?.id ?? categoryOptions[0]!.categoryId;
  }, [categoryOptions]);

  const activeCategoryId =
    selectedCategoryId != null &&
    categoryOptions.some((s) => s.categoryId === selectedCategoryId)
      ? selectedCategoryId
      : defaultCategoryId;

  const selectedSeries =
    activeCategoryId && view?.categorySeries
      ? view.categorySeries.byCategoryId[activeCategoryId]
      : undefined;

  const spendSubtitle =
    kind === "personal"
      ? [
          `Flexible ${formatCurrency(view?.totals.discretionary ?? 0)}`,
          `committed ${formatCurrency(view?.totals.fixed ?? 0)}`,
          view?.totals.reserve != null
            ? `reserves ${formatCurrency(view.totals.reserve)}`
            : null,
          view?.totals.discretionaryShare != null
            ? `${view.totals.discretionaryShare.toFixed(0)}% flexible`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

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

      {!view ? (
        <PageSkeleton label="Loading reports" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {copy.income}
                <PeriodChip label={rangeLabel} />
              </p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(view.totals.income)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {copy.spend}
                <PeriodChip label={rangeLabel} />
              </p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(view.totals.spend)}
              </p>
              {spendSubtitle ? (
                <p className="mt-1 text-xs text-[var(--muted)]">{spendSubtitle}</p>
              ) : null}
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">
                {copy.savings}
                <PeriodChip label={rangeLabel} />
              </p>
              <p
                className={`mt-2 font-display text-2xl ${
                  view.totals.savings >= 0
                    ? "text-[var(--positive)]"
                    : "text-[var(--danger)]"
                }`}
              >
                {formatCurrency(view.totals.savings)}
                {view.totals.savingsRate != null ? (
                  <span className="ml-2 text-base font-sans font-normal text-[var(--muted)]">
                    {view.totals.savingsRate.toFixed(0)}%
                  </span>
                ) : null}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">
                Age of money
                <PeriodChip label={rangeLabel} />
              </p>
              <p className="mt-2 font-display text-2xl">
                {view.ageOfMoney.ageDays == null
                  ? "—"
                  : `${view.ageOfMoney.ageDays.toFixed(0)} days`}
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
              {kind === "personal"
                ? `Income → committed / flexible / reserves → categories. Overspend is drawn from ${copy.savings.toLowerCase()}.`
                : `${copy.income} into categories; spending above ${copy.income.toLowerCase()} is drawn from ${copy.savings.toLowerCase()}`}
              <PeriodChip label={rangeLabel} />
            </p>
            {loading ? chartFallback : (
              <CashFlowSankey
                nodes={view.sankey.nodes}
                links={view.sankey.links}
                onSelectNode={(nodeName) => {
                  if (!rangeFrom || !rangeTo) return;
                  if (nodeName === "Committed" || nodeName === "Flexible" || nodeName === "Reserves" || nodeName === "Fixed" || nodeName === "Discretionary") {
                    setBreakdown({
                      type: "range",
                      title: nodeName,
                      from: rangeFrom,
                      to: rangeTo,
                      flexibility:
                        nodeName === "Committed" || nodeName === "Fixed"
                          ? "fixed"
                          : nodeName === "Reserves"
                            ? "reserve"
                            : "discretionary",
                    });
                    return;
                  }
                  setBreakdown({
                    type: "transactions",
                    title: nodeName,
                    subtitle: rangeLabel,
                    from: rangeFrom,
                    to: rangeTo,
                    categoryName: nodeName,
                  });
                }}
              />
            )}
          </Card>

          {kind === "personal" ? (
            <Card className="mt-6">
              <h2 className="mb-1 font-display text-lg">Monthly cash flow</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Stacked spend by fund with income overlaid
                <PeriodChip label={rangeLabel} />
              </p>
              {loading ? chartFallback : (
                <FlexibilityTrendsChart
                  data={view.flexibilityTrends}
                  onSelect={({ monthKey, flexibility }) => {
                    setBreakdown({
                      type: "period",
                      periodKey: monthKey,
                      granularity: "monthly",
                      flexibility,
                      title:
                        flexibility === "fixed"
                          ? "Committed"
                          : flexibility === "reserve"
                            ? "Reserves"
                            : "Flexible",
                    });
                  }}
                />
              )}
            </Card>
          ) : null}

          <Card className="mt-6">
            <h2 className="mb-1 font-display text-lg">
              {kind === "personal"
                ? "Flexible by category"
                : "Spending by category"}
            </h2>
            <p className="mb-4 text-sm text-[var(--muted)]">
              {kind === "personal"
                ? "Month-over-month trends for controllable spending"
                : "Month-over-month trends for top categories"}
            </p>
            {loading ? chartFallback : (
              <CategoryTrendsChart
                data={view.categoryTrends.months}
                keys={view.categoryTrends.keys}
                onSelect={({ monthKey, categoryName }) => {
                  if (categoryName === "All other") {
                    setBreakdown({
                      type: "period",
                      periodKey: monthKey,
                      granularity: "monthly",
                      flexibility:
                        kind === "personal" ? "discretionary" : undefined,
                      title: "All other",
                    });
                    return;
                  }
                  const { start, end } = monthRange(monthKey);
                  setBreakdown({
                    type: "transactions",
                    title: categoryName,
                    subtitle: formatMonthLabel(monthKey),
                    from: toDateParam(start),
                    to: toDateParam(end),
                    categoryName,
                  });
                }}
              />
            )}
          </Card>

          <Card className="mt-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="mb-1 font-display text-lg">Category over time</h2>
                <p className="text-sm text-[var(--muted)]">
                  Spend vs budget for one category
                </p>
              </div>
              {categoryOptions.length > 0 ? (
                <Select
                  aria-label="Category"
                  value={activeCategoryId ?? ""}
                  onChange={(e) => setSelectedCategoryId(e.target.value || null)}
                >
                  {categoryOptions.map((s) => (
                    <option key={s.categoryId} value={s.categoryId}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
            {loading ? (
              chartFallback
            ) : selectedSeries ? (
              <CategorySpendVsBudgetChart
                series={selectedSeries}
                onSelect={({ month, categoryId, name }) => {
                  const { start, end } = monthRange(month);
                  setBreakdown({
                    type: "transactions",
                    title: name,
                    subtitle: formatMonthLabel(month),
                    from: toDateParam(start),
                    to: toDateParam(end),
                    categoryId: categoryId === "uncategorized" ? null : categoryId,
                  });
                }}
              />
            ) : (
              <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                No categories with spend or budget in this range.
              </p>
            )}
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-1 font-display text-lg">Top merchants</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                {kind === "personal"
                  ? "Teal = flexible · olive = committed · gold = reserves"
                  : "Where the money actually went"}
              </p>
              {loading ? chartFallback : (
                <MerchantList
                  data={view.merchants}
                  colorByFlexibility={kind === "personal"}
                  onSelect={(row) => {
                    if (!rangeFrom || !rangeTo) return;
                    setBreakdown({
                      type: "transactions",
                      title: row.merchant,
                      subtitle: rangeLabel,
                      from: rangeFrom,
                      to: rangeTo,
                      merchant: row.merchant,
                    });
                  }}
                />
              )}
            </Card>
            <Card>
              <h2 className="mb-1 font-display text-lg">Age of money</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Buffer between paychecks and spending
                <PeriodChip label={rangeLabel} />
              </p>
              {loading ? chartFallback : (
                <AgeOfMoneyChart series={view.ageOfMoney.series} />
              )}
            </Card>
          </div>

          {view.incomeBreakdown.length > 0 ? (
            <Card className="mt-6">
              <h2 className="mb-4 font-display text-lg">
                Income sources
                <PeriodChip label={rangeLabel} />
              </h2>
              <ul className="divide-y divide-[var(--border)]">
                {view.incomeBreakdown.map((row) => (
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

          <BreakdownModal
            open={breakdown != null}
            onClose={() => setBreakdown(null)}
            ledger={ledger}
            target={breakdown}
          />
        </>
      )}
    </div>
  );
}

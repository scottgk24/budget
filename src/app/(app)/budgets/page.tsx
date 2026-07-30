"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useLedger } from "@/components/ledger-context";
import { HIDDEN_MONEY, useMoneyFormat, usePrivacy } from "@/components/privacy-context";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  cn,
  monthKey,
  monthlyAllotment,
} from "@/lib/format";
import { ledgerCopy } from "@/lib/ledger-copy";
import { getDate, getDayOfYear, getDaysInMonth, getDaysInYear } from "date-fns";

const CategoryPieChart = dynamic(
  () => import("@/components/budget-charts").then((m) => m.CategoryPieChart),
  {
    ssr: false,
    loading: () => (
      <p className="flex h-56 items-center justify-center text-sm text-[var(--muted)]">
        Loading chart…
      </p>
    ),
  },
);

type Category = {
  id: string;
  name: string;
  budgetPeriod?: "monthly" | "annual";
};
type Budget = { id: string; categoryId: string; amount: number; category: Category };

const SKIP = new Set(["Income", "Transfers", "Review"]);

/** Expected progress through the budget period (0–1). */
function periodPace(annual: boolean, now = new Date()): number {
  if (annual) {
    return getDayOfYear(now) / getDaysInYear(now);
  }
  return getDate(now) / getDaysInMonth(now);
}

type PaceTone = "green" | "yellow" | "red" | "muted";

function paceTone(spent: number, limit: number, pace: number): PaceTone {
  if (limit <= 0) return "muted";
  if (spent > limit) return "red";
  const used = spent / limit;
  // Ahead of schedule by more than ~10% of the period → yellow warning
  if (used > pace + 0.1) return "yellow";
  return "green";
}

const TONE_FILL: Record<PaceTone, string> = {
  green: "bg-[var(--positive)]",
  yellow: "bg-[var(--accent)]",
  red: "bg-[var(--danger)]",
  muted: "bg-[var(--border)]",
};

/** Thin progress bar with AVG / TODAY markers and green/yellow/red fill. */
function PaceProgressBar({
  spent,
  limit,
  annual,
  average = 0,
}: {
  spent: number;
  limit: number;
  annual: boolean;
  /** Average spend on the same scale as `limit` (monthly or annualized). */
  average?: number;
}) {
  const { formatCurrency } = useMoneyFormat();
  if (limit <= 0) {
    return <div className="h-1 w-full rounded-full bg-[var(--border)]/40" />;
  }

  const pace = periodPace(annual);
  const tone = paceTone(spent, limit, pace);
  const spentPct = Math.min(100, (spent / limit) * 100);
  const todayPct = Math.min(100, pace * 100);
  const avgPct = average > 0 ? Math.min(100, (average / limit) * 100) : null;
  const showAvg = avgPct !== null && average > 0;

  // Nudge labels apart when ticks sit close together
  const ticksClose =
    showAvg && Math.abs(avgPct - todayPct) < 12;
  const avgLabelShift = ticksClose && avgPct >= todayPct ? "translate-x-0" : "-translate-x-1/2";
  const todayLabelShift =
    ticksClose && showAvg && todayPct < avgPct ? "-translate-x-full" : "-translate-x-1/2";

  return (
    <div className="relative pt-3.5">
      {showAvg ? (
        <div
          className={cn("pointer-events-none absolute top-0 z-[2]", avgLabelShift)}
          style={{ left: `${avgPct}%` }}
        >
          <span
            className="block text-[9px] font-semibold uppercase tracking-wider text-[var(--muted)]"
            title={`Average ${formatCurrency(average)}`}
          >
            Avg
          </span>
        </div>
      ) : null}
      <div
        className={cn("pointer-events-none absolute top-0 z-[2]", todayLabelShift)}
        style={{ left: `${todayPct}%` }}
      >
        <span
          className="block text-[9px] font-semibold uppercase tracking-wider text-[var(--fg)]"
          title={`${Math.round(todayPct)}% through ${annual ? "year" : "month"}`}
        >
          Today
        </span>
      </div>

      <div
        className="relative h-1.5 w-full rounded-full bg-[var(--border)]/40"
        title={`${formatCurrency(spent)} of ${formatCurrency(limit)}`}
      >
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width] duration-200",
            TONE_FILL[tone],
          )}
          style={{ width: `${spentPct}%` }}
        />
        {showAvg ? (
          <div
            className="absolute top-1/2 z-[1] h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--muted)]"
            style={{ left: `${avgPct}%` }}
            title={`Average ${formatCurrency(average)}`}
          />
        ) : null}
        <div
          className="absolute top-1/2 z-[1] h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--fg)]"
          style={{ left: `${todayPct}%` }}
          title={`${Math.round(todayPct)}% through ${annual ? "year" : "month"}`}
        />
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function BudgetAmountInput({
  value,
  disabled,
  onCommit,
  ariaLabel = "Budget amount",
}: {
  value: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
  ariaLabel?: string;
}) {
  const { hidden } = usePrivacy();
  const [text, setText] = useState(String(Math.round(value)));

  useEffect(() => {
    setText(String(Math.round(value)));
  }, [value]);

  function commit() {
    const parsed = Number(text.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(parsed)) {
      setText(String(Math.round(value)));
      return;
    }
    onCommit(Math.max(0, Math.round(parsed)));
  }

  const digits = Math.max(text.length, 3);

  if (hidden) {
    return (
      <div
        className={cn(
          "inline-flex max-w-full items-center justify-end rounded-md border border-transparent",
          "font-display text-sm tabular-nums text-[var(--muted)] sm:text-base",
          disabled && "opacity-50",
        )}
        aria-label={ariaLabel}
      >
        {HIDDEN_MONEY}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded border border-transparent bg-transparent",
        "focus-within:border-[var(--border)] focus-within:bg-[var(--bg)]/40",
        disabled && "opacity-50",
      )}
    >
      <span className="select-none pl-1 pr-0.5 text-xs font-medium text-[var(--muted)]">$</span>
      <input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        aria-label={ariaLabel}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        // border-box width includes padding, so add room for pr/pl + glyph breathing room
        style={{ width: `${digits + 2}ch` }}
        className="bg-transparent py-0.5 pr-1 pl-0.5 text-right font-display text-sm tabular-nums outline-none sm:text-base"
      />
    </div>
  );
}

export default function BudgetsPage() {
  const { ledger } = useLedger();
  const copy = ledgerCopy(ledger);
  const { formatCurrency } = useMoneyFormat();
  const month = monthKey();
  const [categories, setCategories] = useState<Category[]>([]);
  const [spentByCategory, setSpentByCategory] = useState<Record<string, number>>({});
  const [spentYtdByCategory, setSpentYtdByCategory] = useState<Record<string, number>>({});
  const [averageByCategory, setAverageByCategory] = useState<Record<string, number>>({});
  const [year, setYear] = useState(month.slice(0, 4));
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/budgets?ledger=${ledger}&month=${month}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      return;
    }
    setCategories(json.categories);
    setSpentByCategory(json.spentByCategory ?? {});
    setSpentYtdByCategory(json.spentYtdByCategory ?? {});
    setAverageByCategory(json.averageByCategory ?? {});
    setYear(json.year ?? month.slice(0, 4));
    const next: Record<string, number> = {};
    for (const cat of json.categories as Category[]) {
      const b = (json.budgets as Budget[]).find((x) => x.categoryId === cat.id);
      next[cat.id] = b?.amount ?? 0;
    }
    setDrafts(next);
    setSaved(next);
  }, [ledger, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => categories.filter((c) => !SKIP.has(c.name)),
    [categories],
  );

  const isAnnual = (c: Category) => c.budgetPeriod === "annual";

  /** Monthly picture: annual categories contribute yearly÷12. */
  const totalBudgeted = useMemo(
    () =>
      rows.reduce((sum, c) => {
        const amt = drafts[c.id] ?? 0;
        return sum + (isAnnual(c) ? monthlyAllotment(amt) : amt);
      }, 0),
    [rows, drafts],
  );

  /** Cash that actually left accounts this month (can spike on annual bills). */
  const cashSpentThisMonth = useMemo(
    () => rows.reduce((sum, c) => sum + (spentByCategory[c.id] ?? 0), 0),
    [rows, spentByCategory],
  );

  /**
   * Monthly-comparable spend: annual categories use YTD÷12 so a yearly Insurance
   * charge doesn't blow up the month vs budgeted (also yearly÷12).
   */
  const totalSpent = useMemo(
    () =>
      rows.reduce((sum, c) => {
        if (isAnnual(c)) {
          return sum + monthlyAllotment(spentYtdByCategory[c.id] ?? 0);
        }
        return sum + (spentByCategory[c.id] ?? 0);
      }, 0),
    [rows, spentByCategory, spentYtdByCategory],
  );

  const cashDiffersFromMonthly = Math.abs(cashSpentThisMonth - totalSpent) >= 1;

  const budgetSlices = useMemo(
    () =>
      rows
        .map((c) => {
          const amt = drafts[c.id] ?? 0;
          return {
            id: c.id,
            name: c.name,
            value: isAnnual(c) ? monthlyAllotment(amt) : amt,
          };
        })
        .filter((s) => s.value > 0),
    [rows, drafts],
  );
  const spendSlices = useMemo(
    () =>
      rows
        .map((c) => ({
          id: c.id,
          name: c.name,
          value: isAnnual(c)
            ? monthlyAllotment(spentYtdByCategory[c.id] ?? 0)
            : (spentByCategory[c.id] ?? 0),
        }))
        .filter((s) => s.value > 0),
    [rows, spentByCategory, spentYtdByCategory],
  );

  const allExpanded = rows.length > 0 && rows.every((c) => expanded.has(c.id));

  function toggleRow(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setExpanded(new Set(rows.map((c) => c.id)));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  async function save(categoryId: string, amount: number) {
    const rounded = Math.max(0, Math.round(amount));
    setDrafts((d) => ({ ...d, [categoryId]: rounded }));
    if (saved[categoryId] === rounded) return;
    setSaving(categoryId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, ledger, month, amount: rounded }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setSaved((s) => ({ ...s, [categoryId]: rounded }));
      setNotice(ledger === "business" ? "Limit saved" : "Budget saved");
      window.setTimeout(() => setNotice(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  async function setPeriod(categoryId: string, budgetPeriod: "monthly" | "annual") {
    setSaving(categoryId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/budgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, ledger, month, budgetPeriod }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update period");
      setNotice(
        budgetPeriod === "annual"
          ? ledger === "business"
            ? "Switched to yearly limit"
            : "Switched to yearly budget"
          : ledger === "business"
            ? "Switched to monthly limit"
            : "Switched to monthly budget",
      );
      window.setTimeout(() => setNotice(null), 1500);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update period");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <PageHeader
        title={copy.budgetsTitle}
        description={copy.budgetsDescription(month)}
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-[var(--positive)]">{notice}</p> : null}

      {rows.length === 0 ? (
        <EmptyState title="No categories yet" />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.totalBudgeted}</p>
              <p className="mt-2 font-display text-2xl tabular-nums">
                {formatCurrency(totalBudgeted)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.spentThisMonth}</p>
              <p className="mt-2 font-display text-2xl tabular-nums">
                {formatCurrency(totalSpent)}
              </p>
              {cashDiffersFromMonthly ? (
                <p
                  className="mt-1 text-xs text-[var(--muted)]"
                  title="Annual categories are counted as year-to-date ÷ 12 so lumpy bills match the monthly budget view."
                >
                  Cash out {formatCurrency(cashSpentThisMonth)}
                  <span className="text-[var(--muted)]/80"> · annual smoothed</span>
                </p>
              ) : null}
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">{copy.remaining}</p>
              <p
                className={`mt-2 font-display text-2xl tabular-nums ${
                  totalBudgeted - totalSpent >= 0
                    ? "text-[var(--positive)]"
                    : "text-[var(--danger)]"
                }`}
              >
                {totalBudgeted > 0
                  ? formatCurrency(totalBudgeted - totalSpent)
                  : "—"}
              </p>
              {cashDiffersFromMonthly ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  vs monthly view
                </p>
              ) : null}
            </Card>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-display text-lg">
                {copy.budgetMix}
              </h2>
              <CategoryPieChart
                data={budgetSlices}
                emptyLabel="Nothing here yet"
              />
            </Card>
            <Card>
              <h2 className="mb-3 font-display text-lg">
                {copy.spendMix}
              </h2>
              {cashDiffersFromMonthly ? (
                <p className="mb-2 text-xs text-[var(--muted)]">
                  Annual categories use YTD ÷ 12
                </p>
              ) : null}
              <CategoryPieChart
                data={spendSlices}
                emptyLabel="Nothing here yet"
              />
            </Card>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg">Categories</h2>
            <button
              type="button"
              onClick={() => (allExpanded ? collapseAll() : expandAll())}
              className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--fg)]"
            >
              {allExpanded ? "Collapse all" : "Expand all"}
            </button>
          </div>

          <Card className="overflow-hidden p-0">
            {/* Column headers */}
            <div
              className={cn(
                "hidden border-b border-[var(--border)] bg-[var(--bg)]/50 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--muted)] sm:grid sm:items-center sm:gap-3",
                "sm:grid-cols-[minmax(0,1.5fr)_5.5rem_5.5rem_5.5rem_1.75rem]",
                "md:grid-cols-[minmax(0,1.6fr)_6.5rem_6.5rem_6.5rem_1.75rem]",
              )}
            >
              <span>Category</span>
              <span className="text-right">{copy.budgetColumn}</span>
              <span className="text-right">Actual</span>
              <span className="text-right">{copy.remaining}</span>
              <span className="sr-only">Expand</span>
            </div>

            <ul className="space-y-2 p-2 sm:p-2.5">
              {rows.map((cat, index) => {
                const annual = isAnnual(cat);
                const monthSpent = spentByCategory[cat.id] ?? 0;
                const ytdSpent = spentYtdByCategory[cat.id] ?? 0;
                const progressSpent = annual ? ytdSpent : monthSpent;
                const monthlyAvg = averageByCategory[cat.id] ?? 0;
                const average = annual ? Math.round(monthlyAvg * 12) : monthlyAvg;
                const budgetAmt = drafts[cat.id] ?? 0;
                const monthLimit = annual ? monthlyAllotment(budgetAmt) : budgetAmt;
                const yearLimit = annual ? budgetAmt : budgetAmt * 12;
                const primaryLimit = annual ? yearLimit : monthLimit;
                const primaryRemaining = primaryLimit - progressSpent;
                const over = primaryLimit > 0 && progressSpent > primaryLimit;
                const isOpen = expanded.has(cat.id);

                return (
                  <li
                    key={cat.id}
                    className={cn(
                      "rounded-lg border px-3 py-3 transition-colors sm:px-4",
                      index % 2 === 0
                        ? "border-[var(--border)]/70 bg-[var(--bg)]/25"
                        : "border-[var(--border)]/50 bg-[var(--surface)]",
                      isOpen &&
                        "border-[var(--accent)]/40 bg-[var(--accent-soft)]/35 shadow-[var(--shadow)]",
                    )}
                  >
                    {/* Row 1 — primary columns */}
                    <div
                      className={cn(
                        "grid items-center gap-x-3 gap-y-1.5",
                        "grid-cols-[minmax(0,1fr)_auto]",
                        "sm:grid-cols-[minmax(0,1.5fr)_5.5rem_5.5rem_5.5rem_1.75rem]",
                        "md:grid-cols-[minmax(0,1.6fr)_6.5rem_6.5rem_6.5rem_1.75rem]",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{cat.name}</p>
                          <p className="text-[11px] text-[var(--muted)] sm:hidden">
                            {annual ? "Annual" : "Monthly"}
                            {saving === cat.id ? " · Saving…" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleRow(cat.id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? `Collapse ${cat.name}` : `Expand ${cat.name}`}
                          className="rounded p-1 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--fg)] sm:hidden"
                        >
                          <ChevronIcon open={isOpen} />
                        </button>
                      </div>

                      <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1 sm:contents">
                        <div className="min-w-0 sm:justify-self-end">
                          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)] sm:hidden">
                            {copy.budgetColumn}
                          </p>
                          <BudgetAmountInput
                            value={budgetAmt}
                            disabled={saving === cat.id}
                            onCommit={(next) => void save(cat.id, next)}
                            ariaLabel={`${copy.budgetColumn} amount`}
                          />
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)] sm:hidden">
                            Actual{annual ? " YTD" : ""}
                          </p>
                          <p
                            className={cn(
                              "py-0.5 text-sm tabular-nums",
                              over ? "text-[var(--danger)]" : "text-[var(--fg)]",
                            )}
                          >
                            {formatCurrency(progressSpent)}
                          </p>
                          {annual && monthSpent > 0 ? (
                            <p
                              className="text-[10px] tabular-nums text-[var(--muted)]"
                              title="Charged this month"
                            >
                              This mo. {formatCurrency(monthSpent)}
                            </p>
                          ) : null}
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)] sm:hidden">
                            {copy.remaining}
                          </p>
                          <p
                            className={cn(
                              "py-0.5 text-sm tabular-nums",
                              primaryLimit <= 0
                                ? "text-[var(--muted)]"
                                : primaryRemaining >= 0
                                  ? "text-[var(--positive)]"
                                  : "text-[var(--danger)]",
                            )}
                          >
                            {primaryLimit > 0 ? formatCurrency(primaryRemaining) : "—"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleRow(cat.id)}
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Collapse ${cat.name}` : `Expand ${cat.name}`}
                        className="hidden justify-self-end rounded p-1 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--fg)] sm:inline-flex"
                      >
                        <ChevronIcon open={isOpen} />
                      </button>
                    </div>

                    {/* Row 2 — pace progress */}
                    <div className="mt-1.5 sm:pr-8">
                      <PaceProgressBar
                        spent={progressSpent}
                        limit={primaryLimit}
                        annual={annual}
                        average={average}
                      />
                    </div>

                    {/* Row 3 — details (collapsed by default) */}
                    {isOpen ? (
                      <div className="mt-3 space-y-3 rounded-md border border-[var(--border)]/60 bg-[var(--bg)]/40 px-3 py-3 sm:pr-8">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="inline-flex rounded-md border border-[var(--border)] p-0.5 text-[11px]">
                            <button
                              type="button"
                              disabled={saving === cat.id}
                              className={cn(
                                "rounded px-2 py-0.5 transition-colors",
                                !annual
                                  ? "bg-[var(--accent)]/15 text-[var(--fg)]"
                                  : "text-[var(--muted)] hover:text-[var(--fg)]",
                              )}
                              onClick={() => {
                                if (annual) void setPeriod(cat.id, "monthly");
                              }}
                            >
                              Monthly
                            </button>
                            <button
                              type="button"
                              disabled={saving === cat.id}
                              className={cn(
                                "rounded px-2 py-0.5 transition-colors",
                                annual
                                  ? "bg-[var(--accent)]/15 text-[var(--fg)]"
                                  : "text-[var(--muted)] hover:text-[var(--fg)]",
                              )}
                              onClick={() => {
                                if (!annual) void setPeriod(cat.id, "annual");
                              }}
                            >
                              Annual
                            </button>
                          </div>
                          {saving === cat.id ? (
                            <span className="text-xs text-[var(--muted)]">Saving…</span>
                          ) : null}
                        </div>

                        {annual ? (
                          <div className="grid gap-2 text-[11px] tabular-nums text-[var(--muted)] sm:grid-cols-2">
                            <div className="flex items-baseline justify-between gap-2 rounded-md border border-[var(--border)]/50 px-2.5 py-2">
                              <span>This month</span>
                              <span className="text-[var(--fg)]">
                                {formatCurrency(monthSpent)}
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 rounded-md border border-[var(--border)]/50 px-2.5 py-2">
                              <span>Monthly share</span>
                              <span className="text-[var(--fg)]">
                                {formatCurrency(monthlyAllotment(ytdSpent))}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        {budgetAmt > 0 ? (
                          <div>
                            <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[11px] tabular-nums text-[var(--muted)]">
                              <span>Year {year}</span>
                              <span>
                                {formatCurrency(ytdSpent)} / {formatCurrency(yearLimit)}
                              </span>
                            </div>
                            <PaceProgressBar
                              spent={ytdSpent}
                              limit={yearLimit}
                              annual
                              average={Math.round(monthlyAvg * 12)}
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CategoryPieChart } from "@/components/budget-charts";
import { useLedger } from "@/components/ledger-context";
import { Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { cn, formatCurrency, monthKey, monthlyAllotment } from "@/lib/format";

type Category = {
  id: string;
  name: string;
  budgetPeriod?: "monthly" | "annual";
};
type Budget = { id: string; categoryId: string; amount: number; category: Category };

const SKIP = new Set(["Income", "Transfers"]);

function niceMax(n: number): number {
  const target = Math.max(n, 100);
  if (target <= 100) return 100;
  if (target <= 250) return 250;
  if (target <= 500) return 500;
  if (target <= 1000) return 1000;
  if (target <= 2500) return 2500;
  if (target <= 5000) return 5000;
  if (target <= 10_000) return 10_000;
  if (target <= 25_000) return 25_000;
  const step = target > 50_000 ? 5000 : 1000;
  return Math.ceil(target / step) * step;
}

function sliderStep(max: number): number {
  if (max <= 250) return 5;
  if (max <= 1000) return 10;
  if (max <= 5000) return 25;
  if (max <= 10_000) return 50;
  return 100;
}

/** Generous ceiling so high-limit categories (housing, etc.) aren't stuck low. */
function baseSliderMax(average: number, spent: number, budgetAmt: number): number {
  return niceMax(
    Math.max(
      average * 5,
      spent * 2,
      budgetAmt,
      budgetAmt > 0 ? budgetAmt * 1.25 : 0,
      2000,
    ),
  );
}

function BudgetSlider({
  value,
  average,
  spent,
  baseMax,
  onChange,
  onCommit,
  disabled,
}: {
  value: number;
  average: number;
  spent: number;
  baseMax: number;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  disabled?: boolean;
}) {
  const [max, setMax] = useState(() => Math.max(baseMax, value, 2000));
  const step = sliderStep(max);
  const avgPct = max > 0 ? Math.min(100, (average / max) * 100) : 0;
  const spentPct = max > 0 ? Math.min(100, (spent / max) * 100) : 0;

  useEffect(() => {
    setMax((prev) => Math.max(prev, baseMax, value));
  }, [baseMax, value]);

  function expandIfNeeded(next: number) {
    // At the end of the track → grow so the user can keep increasing.
    if (next >= max - step) {
      setMax((prev) => niceMax(Math.max(prev * 1.5, next + step * 10)));
    }
  }

  function handleChange(next: number) {
    onChange(next);
    expandIfNeeded(next);
  }

  function handleCommit(el: HTMLInputElement) {
    onCommit(Number(el.value));
  }

  return (
    <div className="w-full">
      <div className="relative px-0.5 pt-5 pb-1">
        {average > 0 ? (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2"
            style={{ left: `${avgPct}%` }}
          >
            <div className="flex flex-col items-center">
              <span className="whitespace-nowrap rounded bg-[var(--fg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--surface)]">
                avg {formatCurrency(average)}
              </span>
              <span className="mt-0.5 h-2 w-px bg-[var(--fg)]" />
            </div>
          </div>
        ) : null}

        <div className="relative h-2 rounded-full bg-[var(--bg)]">
          {spent > 0 ? (
            <div
              className="pointer-events-none absolute top-1/2 z-[1] h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--danger)]/70"
              style={{ left: `${spentPct}%` }}
              title={`Spent ${formatCurrency(spent)}`}
            />
          ) : null}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]/35"
            style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
          />
          <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={Math.min(value, max)}
            disabled={disabled}
            aria-label="Budget amount"
            className={cn(
              "absolute inset-0 z-[2] h-2 w-full cursor-pointer appearance-none bg-transparent",
              "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2",
              "[&::-webkit-slider-thumb]:border-[var(--accent)] [&::-webkit-slider-thumb]:bg-[var(--surface)]",
              "[&::-webkit-slider-thumb]:shadow-sm",
              "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full",
              "[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[var(--accent)]",
              "[&::-moz-range-thumb]:bg-[var(--surface)]",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
            onChange={(e) => handleChange(Number(e.target.value))}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={(e) => handleCommit(e.currentTarget)}
            onPointerCancel={(e) => handleCommit(e.currentTarget)}
            onKeyUp={(e) => {
              if (
                e.key === "ArrowLeft" ||
                e.key === "ArrowRight" ||
                e.key === "Home" ||
                e.key === "End"
              ) {
                handleCommit(e.currentTarget);
              }
            }}
          />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
        <span>$0</span>
        <span>{formatCurrency(max)}</span>
      </div>
    </div>
  );
}

function BudgetAmountInput({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (next: number) => void;
}) {
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

  return (
    <div className="flex items-center justify-end gap-1">
      <span className="text-sm text-[var(--muted)]">$</span>
      <Input
        type="text"
        inputMode="decimal"
        disabled={disabled}
        aria-label="Budget amount"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        className="w-24 py-1 text-right font-display text-xl tabular-nums"
      />
    </div>
  );
}

export default function BudgetsPage() {
  const { ledger } = useLedger();
  const month = monthKey();
  const [categories, setCategories] = useState<Category[]>([]);
  const [spentByCategory, setSpentByCategory] = useState<Record<string, number>>({});
  const [spentYtdByCategory, setSpentYtdByCategory] = useState<Record<string, number>>({});
  const [averageByCategory, setAverageByCategory] = useState<Record<string, number>>({});
  const [averageMonths, setAverageMonths] = useState(6);
  const [year, setYear] = useState(month.slice(0, 4));
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setAverageMonths(json.averageMonths ?? 6);
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
  const totalSpent = useMemo(
    () => rows.reduce((sum, c) => sum + (spentByCategory[c.id] ?? 0), 0),
    [rows, spentByCategory],
  );
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
          value: spentByCategory[c.id] ?? 0,
        }))
        .filter((s) => s.value > 0),
    [rows, spentByCategory],
  );

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
      setNotice("Budget saved");
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
      setNotice(budgetPeriod === "annual" ? "Switched to yearly budget" : "Switched to monthly budget");
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
        title="Budgets"
        description={`Monthly limits · yearly for Travel, Insurance, Gifts · avg = last ${averageMonths} months · ${ledger === "personal" ? "Personal" : "Business"} · ${month}`}
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-[var(--positive)]">{notice}</p> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Categories are created when your workspace is set up."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-[var(--muted)]">Total budgeted (monthly)</p>
              <p className="mt-2 font-display text-2xl tabular-nums">
                {formatCurrency(totalBudgeted)}
              </p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Annual categories count as yearly ÷ 12
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Spent this month</p>
              <p className="mt-2 font-display text-2xl tabular-nums">
                {formatCurrency(totalSpent)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Remaining</p>
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
            </Card>
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-1 font-display text-lg">
                Budget mix
              </h2>
              <p className="mb-3 text-sm text-[var(--muted)]">
                How this month&apos;s budget is allocated
              </p>
              <CategoryPieChart
                data={budgetSlices}
                emptyLabel="Set some category budgets to see the mix"
              />
            </Card>
            <Card>
              <h2 className="mb-1 font-display text-lg">
                Spend mix
              </h2>
              <p className="mb-3 text-sm text-[var(--muted)]">
                Where spending went this month
              </p>
              <CategoryPieChart
                data={spendSlices}
                emptyLabel="No spending in these categories yet"
              />
            </Card>
          </div>

          <div className="grid gap-3">
            {rows.map((cat) => {
              const annual = isAnnual(cat);
              const monthSpent = spentByCategory[cat.id] ?? 0;
              const ytdSpent = spentYtdByCategory[cat.id] ?? 0;
              const progressSpent = annual ? ytdSpent : monthSpent;
              const monthlyAvg = averageByCategory[cat.id] ?? 0;
              const average = annual ? Math.round(monthlyAvg * 12) : monthlyAvg;
              const budgetAmt = drafts[cat.id] ?? 0;
              const max = baseSliderMax(average, progressSpent, budgetAmt);
              const pct =
                budgetAmt > 0 ? Math.min(100, (progressSpent / budgetAmt) * 100) : 0;
              const over = budgetAmt > 0 && progressSpent > budgetAmt;

              return (
                <Card key={cat.id} className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{cat.name}</p>
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
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted)]">
                        {annual ? (
                          <>
                            YTD{" "}
                            <span className={over ? "text-[var(--danger)]" : undefined}>
                              {formatCurrency(ytdSpent)}
                            </span>
                            {budgetAmt > 0
                              ? ` of ${formatCurrency(budgetAmt)} for ${year}`
                              : " · no yearly limit set"}
                            {monthSpent > 0
                              ? ` · ${formatCurrency(monthSpent)} this month`
                              : ""}
                            {average > 0
                              ? ` · avg ~${formatCurrency(average)}/yr`
                              : ""}
                          </>
                        ) : (
                          <>
                            Spent{" "}
                            <span className={over ? "text-[var(--danger)]" : undefined}>
                              {formatCurrency(monthSpent)}
                            </span>
                            {budgetAmt > 0
                              ? ` of ${formatCurrency(budgetAmt)}`
                              : " · no limit set"}
                            {average > 0
                              ? ` · avg ${formatCurrency(average)}/mo`
                              : ""}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <BudgetAmountInput
                        value={budgetAmt}
                        disabled={saving === cat.id}
                        onCommit={(next) => void save(cat.id, next)}
                      />
                      <p className="text-[11px] text-[var(--muted)]">
                        {saving === cat.id
                          ? "Saving…"
                          : annual
                            ? "Yearly budget"
                            : "Monthly budget"}
                      </p>
                    </div>
                  </div>

                  {budgetAmt > 0 ? (
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
                      <div
                        className={`h-full rounded-full ${over ? "bg-[var(--danger)]" : "bg-[var(--accent)]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}

                  <BudgetSlider
                    value={budgetAmt}
                    average={average}
                    spent={progressSpent}
                    baseMax={max}
                    disabled={saving === cat.id}
                    onChange={(next) => setDrafts((d) => ({ ...d, [cat.id]: next }))}
                    onCommit={(next) => void save(cat.id, next)}
                  />
                </Card>
              );
            })}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-[var(--muted)]">
        Drag the slider or type an amount. Annual categories track year-to-date spend against a
        yearly limit and count as yearly ÷ 12 in the monthly totals. The thin red tick is progress
        so far (this month, or YTD for annual).
      </p>
    </div>
  );
}

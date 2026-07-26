"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CategoryPieChart } from "@/components/budget-charts";
import { useLedger } from "@/components/ledger-context";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import {
  cn,
  formatCompactCurrency,
  formatCurrency,
  monthKey,
  monthlyAllotment,
} from "@/lib/format";

type Category = {
  id: string;
  name: string;
  budgetPeriod?: "monthly" | "annual";
};
type Budget = { id: string; categoryId: string; amount: number; category: Category };

const SKIP = new Set(["Income", "Transfers"]);

/** Fixed slider ceilings — expand one step at a time when releasing at the right edge. */
const SLIDER_TIERS = [500, 1000, 3000, 5000] as const;

function sliderStep(max: number): number {
  if (max <= 500) return 5;
  if (max <= 1000) return 10;
  return 25;
}

/** Smallest tier that can hold `value` (capped at the top tier). */
function tierForValue(value: number): number {
  for (const tier of SLIDER_TIERS) {
    if (value <= tier) return tier;
  }
  return SLIDER_TIERS[SLIDER_TIERS.length - 1];
}

function tierIndex(max: number): number {
  const idx = SLIDER_TIERS.indexOf(max as (typeof SLIDER_TIERS)[number]);
  return idx >= 0 ? idx : SLIDER_TIERS.indexOf(tierForValue(max) as (typeof SLIDER_TIERS)[number]);
}

/** Next higher ceiling, or the same if already at the top. */
function expandOneTier(max: number): number {
  const idx = tierIndex(max);
  if (idx < 0 || idx >= SLIDER_TIERS.length - 1) return SLIDER_TIERS[SLIDER_TIERS.length - 1];
  return SLIDER_TIERS[idx + 1];
}

/**
 * Shrink when value drops under the next-lower tier's ceiling
 * (e.g. max 3000 → under 1000 → max 1000). Never expands.
 */
function contractSliderMax(value: number, prevMax: number): number {
  const clamped = Math.max(0, value);
  const needed = tierForValue(clamped);
  let idx = tierIndex(prevMax);
  if (idx < 0) return needed;

  while (idx > 0 && clamped < SLIDER_TIERS[idx - 1]) {
    idx -= 1;
  }

  return Math.max(SLIDER_TIERS[idx], needed);
}

function ProgressTrack({
  label,
  spent,
  limit,
}: {
  label: string;
  spent: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const over = limit > 0 && spent > limit;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-[var(--muted)]">{label}</span>
        <span
          className={cn(
            "tabular-nums",
            over ? "text-[var(--danger)]" : "text-[var(--fg)]",
          )}
        >
          {formatCurrency(spent)}
          <span className="text-[var(--muted)]"> / {formatCurrency(limit)}</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-200",
            over ? "bg-[var(--danger)]" : "bg-[var(--accent)]",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BudgetSlider({
  value,
  average,
  spent,
  onChange,
  onCommit,
  disabled,
}: {
  value: number;
  average: number;
  spent: number;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  disabled?: boolean;
}) {
  const [max, setMax] = useState(() => tierForValue(value));
  const step = sliderStep(max);
  const atCeiling = value >= max;
  const canExpand = tierIndex(max) < SLIDER_TIERS.length - 1;
  const displayValue = Math.min(value, max);
  const valuePct = max > 0 ? Math.min(100, (displayValue / max) * 100) : 0;
  const avgPct = max > 0 ? Math.min(100, (average / max) * 100) : 0;
  const spentPct = max > 0 ? Math.min(100, (spent / max) * 100) : 0;

  // Typed amounts: fit the ceiling to the value. Never expand mid-drag via this path.
  useEffect(() => {
    setMax((prev) => Math.max(contractSliderMax(value, prev), tierForValue(value)));
  }, [value]);

  function handleChange(next: number) {
    // Stay within the current tier while dragging so the pointer can't cascade
    // through every ceiling in one stroke.
    const clamped = Math.min(next, max);
    onChange(clamped);
    setMax((prev) => contractSliderMax(clamped, prev));
  }

  function handleCommit(el: HTMLInputElement) {
    const next = Math.min(Number(el.value), max);
    onCommit(next);
    // Expand one tier only on release at the right edge — not while dragging.
    if (next >= max && canExpand) {
      setMax(expandOneTier(max));
      return;
    }
    setMax(contractSliderMax(next, max));
  }

  return (
    <div className="w-full max-w-xl">
      <div className="relative">
        <div className="relative h-6">
          {average > 0 && average <= max && Math.abs(avgPct - valuePct) > 10 ? (
            <div
              className="pointer-events-none absolute bottom-0 z-10 -translate-x-1/2"
              style={{ left: `${avgPct}%` }}
            >
              <div className="flex flex-col items-center">
                <span className="whitespace-nowrap rounded bg-[var(--fg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--surface)]">
                  avg {formatCompactCurrency(average)}
                </span>
                <span className="mt-0.5 h-1.5 w-px bg-[var(--fg)]" />
              </div>
            </div>
          ) : null}

          <div
            className="pointer-events-none absolute bottom-0 z-20 -translate-x-1/2"
            style={{ left: `${valuePct}%` }}
          >
            <div className="flex flex-col items-center">
              <span className="whitespace-nowrap rounded-md bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--on-accent)] shadow-sm">
                {formatCompactCurrency(displayValue)}
              </span>
              <span className="mt-0.5 h-1.5 w-px bg-[var(--accent)]" />
            </div>
          </div>
        </div>

        <div className="relative h-2.5 rounded-full bg-[var(--bg)] ring-1 ring-[var(--border)]/60">
          {spent > 0 && spent <= max ? (
            <div
              className="pointer-events-none absolute top-1/2 z-[1] h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--danger)]"
              style={{ left: `${spentPct}%` }}
              title={`Spent ${formatCurrency(spent)}`}
            />
          ) : null}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]/45"
            style={{ width: `${valuePct}%` }}
          />
          <input
            type="range"
            min={0}
            max={max}
            step={step}
            value={displayValue}
            disabled={disabled}
            aria-label="Budget amount"
            className={cn(
              "absolute inset-0 z-[2] h-2.5 w-full cursor-pointer appearance-none bg-transparent",
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
      <div className="mt-1.5 flex items-center justify-between text-xs tabular-nums">
        <span className="font-medium text-[var(--fg)]">$0</span>
        <span className="text-[11px] text-[var(--muted)]">
          {atCeiling && canExpand
            ? `release to unlock ${formatCompactCurrency(expandOneTier(max))}`
            : average > 0 && average <= max && Math.abs(avgPct - valuePct) <= 10
              ? `avg ${formatCompactCurrency(average)}`
              : `max ${formatCompactCurrency(max)}`}
        </span>
        <span className="font-medium text-[var(--fg)]">{formatCompactCurrency(max)}</span>
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

  const digits = Math.max(text.length, 3);

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--bg)]",
        "focus-within:border-[var(--accent)]",
        disabled && "opacity-50",
      )}
    >
      <span className="select-none pl-2 pr-0.5 text-xs font-medium text-[var(--muted)]">$</span>
      <input
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
        // border-box width includes padding, so add room for pr/pl + glyph breathing room
        style={{ width: `${digits + 2}ch` }}
        className="bg-transparent py-1 pr-2.5 pl-0.5 text-right font-display text-base tabular-nums outline-none"
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
              const monthLimit = annual ? monthlyAllotment(budgetAmt) : budgetAmt;
              const yearLimit = annual ? budgetAmt : budgetAmt * 12;

              return (
                <Card key={cat.id} className="space-y-3.5 p-4 sm:p-5">
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
                        {average > 0
                          ? `Avg ${formatCurrency(average)}${annual ? "/yr" : "/mo"}`
                          : "No recent spending average"}
                        {saving === cat.id ? " · Saving…" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <BudgetAmountInput
                        value={budgetAmt}
                        disabled={saving === cat.id}
                        onCommit={(next) => void save(cat.id, next)}
                      />
                      <p className="mt-1 text-[11px] text-[var(--muted)]">
                        {annual ? "Yearly budget" : "Monthly budget"}
                      </p>
                    </div>
                  </div>

                  {budgetAmt > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <ProgressTrack
                        label="This month"
                        spent={monthSpent}
                        limit={monthLimit}
                      />
                      <ProgressTrack
                        label={`Year ${year}`}
                        spent={ytdSpent}
                        limit={yearLimit}
                      />
                    </div>
                  ) : null}

                  <BudgetSlider
                    value={budgetAmt}
                    average={average}
                    spent={progressSpent}
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
        Drag the slider or type an amount. Each category shows this month versus its monthly
        limit, plus year-to-date versus the annualized budget (monthly × 12, or the yearly
        limit for annual categories). The red tick marks spend so far on the slider.
      </p>
    </div>
  );
}

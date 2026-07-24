"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLedger } from "@/components/ledger-context";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { cn, formatCurrency, monthKey } from "@/lib/format";

type Category = { id: string; name: string };
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
  const step = target > 10_000 ? 1000 : 500;
  return Math.ceil(target / step) * step;
}

function sliderStep(max: number): number {
  if (max <= 250) return 5;
  if (max <= 1000) return 10;
  if (max <= 5000) return 25;
  return 50;
}

function BudgetSlider({
  value,
  average,
  spent,
  max,
  onChange,
  onCommit,
  disabled,
}: {
  value: number;
  average: number;
  spent: number;
  max: number;
  onChange: (next: number) => void;
  onCommit: (next: number) => void;
  disabled?: boolean;
}) {
  const avgPct = max > 0 ? Math.min(100, (average / max) * 100) : 0;
  const spentPct = max > 0 ? Math.min(100, (spent / max) * 100) : 0;
  const step = sliderStep(max);

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
          {/* This month spent marker */}
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
            onChange={(e) => onChange(Number(e.target.value))}
            onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
                onCommit(Number((e.target as HTMLInputElement).value));
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

export default function BudgetsPage() {
  const { ledger } = useLedger();
  const month = monthKey();
  const [categories, setCategories] = useState<Category[]>([]);
  const [spentByCategory, setSpentByCategory] = useState<Record<string, number>>({});
  const [averageByCategory, setAverageByCategory] = useState<Record<string, number>>({});
  const [averageMonths, setAverageMonths] = useState(6);
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
    setAverageByCategory(json.averageByCategory ?? {});
    setAverageMonths(json.averageMonths ?? 6);
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

  async function save(categoryId: string, amount: number) {
    const rounded = Math.max(0, Math.round(amount));
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
      setDrafts((d) => ({ ...d, [categoryId]: rounded }));
      setNotice("Budget saved");
      window.setTimeout(() => setNotice(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Budgets"
        description={`Drag to set monthly limits · avg marker = last ${averageMonths} months · ${ledger === "personal" ? "Personal" : "Business"} · ${month}`}
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-[var(--positive)]">{notice}</p> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Categories are created when your workspace is set up."
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((cat) => {
            const spent = spentByCategory[cat.id] ?? 0;
            const average = averageByCategory[cat.id] ?? 0;
            const budgetAmt = drafts[cat.id] ?? 0;
            const max = niceMax(Math.max(average * 2.5, spent * 1.25, budgetAmt, 200));
            const pct = budgetAmt > 0 ? Math.min(100, (spent / budgetAmt) * 100) : 0;
            const over = budgetAmt > 0 && spent > budgetAmt;

            return (
              <Card key={cat.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{cat.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      Spent{" "}
                      <span className={over ? "text-[var(--danger)]" : undefined}>
                        {formatCurrency(spent)}
                      </span>
                      {budgetAmt > 0 ? ` of ${formatCurrency(budgetAmt)}` : " · no limit set"}
                      {average > 0 ? ` · avg ${formatCurrency(average)}/mo` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-[family-name:var(--font-display)] text-xl tabular-nums">
                      {formatCurrency(budgetAmt)}
                    </p>
                    <p className="text-[11px] text-[var(--muted)]">
                      {saving === cat.id ? "Saving…" : "Budget"}
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
                  spent={spent}
                  max={max}
                  disabled={saving === cat.id}
                  onChange={(next) => setDrafts((d) => ({ ...d, [cat.id]: next }))}
                  onCommit={(next) => void save(cat.id, next)}
                />
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-[var(--muted)]">
        Green fill is your budget. The top label marks average monthly spend. The thin red tick is
        this month&apos;s spend so far.
      </p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useMoneyFormat } from "@/components/privacy-context";
import { Button } from "@/components/ui";
import {
  formatDate,
  periodBounds,
  toDateParam,
  type MetricsGranularity,
} from "@/lib/format";
import { ledgerCopy } from "@/lib/ledger-copy";
import type { Ledger } from "@/lib/types";

type CategoryRow = {
  categoryId: string | null;
  name: string;
  spend: number;
  income: number;
  count: number;
};

type PeriodSummary = {
  key: string;
  label: string;
  start: string;
  end: string;
  spend: number;
  income: number;
  savings: number;
  transactionCount: number;
  categories: CategoryRow[];
};

type Tx = {
  id: string;
  name: string;
  merchantName: string | null;
  amount: number;
  date: string;
  pending: boolean;
  category: { name: string } | null;
  account: { name: string; mask: string | null };
};

type SelectedCategory = {
  categoryId: string | null;
  name: string;
};

type View = "categories" | "transactions";

export function PeriodDrilldown({
  open,
  onClose,
  ledger,
  granularity,
  periodKey,
}: {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  granularity: MetricsGranularity;
  periodKey: string | null;
}) {
  const titleId = useId();
  const copy = ledgerCopy(ledger);
  const { formatCurrency, formatSignedCurrency } = useMoneyFormat();
  const [view, setView] = useState<View>("categories");
  const [summary, setSummary] = useState<PeriodSummary | null>(null);
  const [category, setCategory] = useState<SelectedCategory | null>(null);
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!periodKey) return;
    setLoading(true);
    setError(null);
    setView("categories");
    setCategory(null);
    setTransactions([]);
    try {
      const params = new URLSearchParams({
        ledger,
        granularity,
        key: periodKey,
      });
      const res = await fetch(`/api/metrics/period?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load breakdown");
      setSummary(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load breakdown");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [ledger, granularity, periodKey]);

  const loadTransactions = useCallback(
    async (selected: SelectedCategory | null) => {
      if (!periodKey) return;
      setTxLoading(true);
      setError(null);
      try {
        const { start, end } = periodBounds(periodKey, granularity);
        const params = new URLSearchParams({
          ledger,
          from: toDateParam(start),
          to: toDateParam(end),
          limit: "300",
        });
        if (selected) {
          params.set("categoryId", selected.categoryId ?? "none");
        }
        const res = await fetch(`/api/transactions?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load transactions");
        setTransactions(json.transactions);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load transactions");
        setTransactions([]);
      } finally {
        setTxLoading(false);
      }
    },
    [ledger, granularity, periodKey],
  );

  useEffect(() => {
    if (!open || !periodKey) return;
    void loadSummary();
  }, [open, periodKey, loadSummary]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  async function openCategory(row: CategoryRow) {
    const selected = { categoryId: row.categoryId, name: row.name };
    setCategory(selected);
    setView("transactions");
    await loadTransactions(selected);
  }

  async function openAllTransactions() {
    setCategory(null);
    setView("transactions");
    await loadTransactions(null);
  }

  function backToCategories() {
    setView("categories");
    setCategory(null);
    setTransactions([]);
  }

  if (!open || !periodKey) return null;

  const maxSpend = Math.max(1, ...(summary?.categories.map((c) => c.spend) ?? [1]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            {view === "transactions" ? (
              <button
                type="button"
                onClick={backToCategories}
                className="mb-1 text-xs text-[var(--accent)] hover:underline"
              >
                ← Categories
              </button>
            ) : null}
            <h2
              id={titleId}
              className="font-display text-xl leading-tight"
            >
              {view === "transactions"
                ? category
                  ? category.name
                  : "All transactions"
                : (summary?.label ?? "Period")}
            </h2>
            {view === "transactions" && summary?.label ? (
              <p className="mt-0.5 text-sm text-[var(--muted)]">{summary.label}</p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" className="shrink-0 px-2" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}

          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--muted)]">Loading…</p>
          ) : view === "categories" && summary ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-[var(--muted)]">{copy.spend}</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {formatCurrency(summary.spend)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">{copy.income}</p>
                  <p className="mt-1 text-sm font-medium tabular-nums text-[var(--positive)]">
                    {formatCurrency(summary.income)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">{copy.savings}</p>
                  <p
                    className={`mt-1 text-sm font-medium tabular-nums ${
                      summary.savings >= 0 ? "text-[var(--positive)]" : "text-[var(--danger)]"
                    }`}
                  >
                    {formatCurrency(summary.savings)}
                  </p>
                </div>
              </div>

              {summary.categories.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  No transactions in this period.
                </p>
              ) : (
                <ul className="space-y-1">
                  {summary.categories.map((row) => (
                    <li key={row.categoryId ?? "none"}>
                      <button
                        type="button"
                        onClick={() => void openCategory(row)}
                        className="w-full rounded-lg px-3 py-2.5 text-left transition hover:bg-[var(--bg)]"
                      >
                        <div className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-medium">{row.name}</span>
                          <span className="shrink-0 tabular-nums text-[var(--muted)]">
                            {row.spend > 0
                              ? formatCurrency(row.spend)
                              : row.income > 0
                                ? `+${formatCurrency(row.income)}`
                                : formatCurrency(0)}
                            <span className="ml-2 text-xs">· {row.count}</span>
                          </span>
                        </div>
                        {row.spend > 0 ? (
                          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--bg)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${Math.min(100, (row.spend / maxSpend) * 100)}%` }}
                            />
                          </div>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {summary.transactionCount > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full"
                  onClick={() => void openAllTransactions()}
                >
                  View all {summary.transactionCount} transactions
                </Button>
              ) : null}
            </>
          ) : view === "transactions" ? (
            txLoading ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">Loading…</p>
            ) : transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">
                No transactions in this category.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {transactions.map((tx) => (
                  <li key={tx.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{tx.merchantName || tx.name}</p>
                      <p className="text-[var(--muted)]">
                        {formatDate(tx.date)}
                        {tx.pending ? " · pending" : ""}
                        {" · "}
                        {tx.account.name}
                        {tx.account.mask ? ` ···${tx.account.mask}` : ""}
                        {!category && tx.category ? ` · ${tx.category.name}` : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 tabular-nums ${
                        tx.amount < 0 ? "text-[var(--positive)]" : ""
                      }`}
                    >
                      {formatSignedCurrency(tx.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

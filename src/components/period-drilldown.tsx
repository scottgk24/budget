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
  flexibility?: "fixed" | "discretionary" | null;
};

type PeriodSummary = {
  key: string | null;
  label: string;
  start: string;
  end: string;
  spend: number;
  fixedSpend?: number | null;
  discretionarySpend?: number | null;
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

/** What the breakdown modal should show. */
export type BreakdownTarget =
  | {
      type: "period";
      periodKey: string;
      granularity: MetricsGranularity;
      /** When set, category list is filtered to this flexibility. */
      flexibility?: "fixed" | "discretionary";
      title?: string;
    }
  | {
      type: "range";
      title: string;
      from: string;
      to: string;
      flexibility?: "fixed" | "discretionary";
    }
  | {
      type: "transactions";
      title: string;
      subtitle?: string;
      from: string;
      to: string;
      categoryId?: string | null;
      categoryName?: string;
      merchant?: string;
    };

export function BreakdownModal({
  open,
  onClose,
  ledger,
  target,
}: {
  open: boolean;
  onClose: () => void;
  ledger: Ledger;
  target: BreakdownTarget | null;
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
  const [directSubtitle, setDirectSubtitle] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!target || target.type === "transactions") return;
    setLoading(true);
    setError(null);
    setView("categories");
    setCategory(null);
    setTransactions([]);
    try {
      const params = new URLSearchParams({ ledger });
      if (target.type === "period") {
        params.set("granularity", target.granularity);
        params.set("key", target.periodKey);
        if (target.flexibility) params.set("flexibility", target.flexibility);
      } else {
        params.set("from", target.from);
        params.set("to", target.to);
        if (target.flexibility) params.set("flexibility", target.flexibility);
      }
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
  }, [ledger, target]);

  const loadTransactions = useCallback(
    async (opts: {
      categoryId?: string | null;
      categoryName?: string;
      merchant?: string;
      flexibility?: "fixed" | "discretionary";
      from: string;
      to: string;
    }) => {
      setTxLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          ledger,
          from: opts.from,
          to: opts.to,
          limit: "300",
        });
        if (opts.merchant) {
          params.set("merchant", opts.merchant);
        } else if (opts.categoryName) {
          params.set("categoryName", opts.categoryName);
        } else if (opts.categoryId !== undefined) {
          params.set("categoryId", opts.categoryId ?? "none");
        }
        if (opts.flexibility) {
          params.set("flexibility", opts.flexibility);
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
    [ledger],
  );

  const loadDirect = useCallback(async () => {
    if (!target || target.type !== "transactions") return;
    setLoading(true);
    setError(null);
    setView("transactions");
    setCategory(
      target.categoryId !== undefined || target.categoryName
        ? {
            categoryId: target.categoryId ?? null,
            name: target.categoryName ?? target.title,
          }
        : target.merchant
          ? { categoryId: null, name: target.merchant }
          : null,
    );
    setSummary(null);
    setDirectSubtitle(target.subtitle ?? null);
    setTransactions([]);
    try {
      await loadTransactions({
        from: target.from,
        to: target.to,
        categoryId: target.categoryId,
        categoryName: target.categoryName,
        merchant: target.merchant,
      });
    } finally {
      setLoading(false);
    }
  }, [target, loadTransactions]);

  useEffect(() => {
    if (!open || !target) return;
    if (target.type === "transactions") {
      void loadDirect();
    } else {
      void loadSummary();
    }
  }, [open, target, loadSummary, loadDirect]);

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

  function dateRangeForTx(): { from: string; to: string } | null {
    if (!target) return null;
    if (target.type === "transactions" || target.type === "range") {
      return { from: target.from, to: target.to };
    }
    const { start, end } = periodBounds(target.periodKey, target.granularity);
    return { from: toDateParam(start), to: toDateParam(end) };
  }

  function flexibilityForTx(): "fixed" | "discretionary" | undefined {
    if (!target) return undefined;
    if (target.type === "period" || target.type === "range") {
      return target.flexibility;
    }
    return undefined;
  }

  async function openCategory(row: CategoryRow) {
    const selected = { categoryId: row.categoryId, name: row.name };
    const range = dateRangeForTx();
    if (!range) return;
    setCategory(selected);
    setView("transactions");
    await loadTransactions({
      ...range,
      categoryId: row.categoryId,
    });
  }

  async function openAllTransactions() {
    const range = dateRangeForTx();
    if (!range) return;
    setCategory(null);
    setView("transactions");
    await loadTransactions({
      ...range,
      flexibility: flexibilityForTx(),
    });
  }

  function backToCategories() {
    if (target?.type === "transactions") {
      onClose();
      return;
    }
    setView("categories");
    setCategory(null);
    setTransactions([]);
  }

  if (!open || !target) return null;

  const heading =
    view === "transactions"
      ? category
        ? category.name
        : target.type === "transactions"
          ? target.title
          : "All transactions"
      : target.type === "period"
        ? (target.title ?? summary?.label ?? "Period")
        : target.type === "range"
          ? target.title
          : target.title;

  const subtitle =
    view === "transactions"
      ? (summary?.label ?? directSubtitle)
      : target.type === "period" && target.flexibility
        ? summary?.label
        : target.type === "range"
          ? summary?.label
          : null;

  const showBack =
    view === "transactions" && target.type !== "transactions";

  const maxSpend = Math.max(1, ...(summary?.categories.map((c) => c.spend) ?? [1]));
  const flexOnly =
    (target.type === "period" || target.type === "range") &&
    target.flexibility != null;

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
            {showBack ? (
              <button
                type="button"
                onClick={backToCategories}
                className="mb-1 text-xs text-[var(--accent)] hover:underline"
              >
                ← Categories
              </button>
            ) : null}
            <h2 id={titleId} className="font-display text-xl leading-tight">
              {heading}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-[var(--muted)]">{subtitle}</p>
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
              {!flexOnly ? (
                <div
                  className={`mb-4 grid gap-3 text-center ${
                    ledger === "personal" && summary.discretionarySpend != null
                      ? "grid-cols-2 sm:grid-cols-4"
                      : "grid-cols-3"
                  }`}
                >
                  {ledger === "personal" && summary.discretionarySpend != null ? (
                    <>
                      <div>
                        <p className="text-xs text-[var(--muted)]">Discretionary</p>
                        <p className="mt-1 text-sm font-medium tabular-nums text-[var(--danger)]">
                          {formatCurrency(summary.discretionarySpend)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-[var(--muted)]">Fixed</p>
                        <p className="mt-1 text-sm font-medium tabular-nums">
                          {formatCurrency(summary.fixedSpend ?? 0)}
                        </p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-xs text-[var(--muted)]">{copy.spend}</p>
                      <p className="mt-1 text-sm font-medium tabular-nums">
                        {formatCurrency(summary.spend)}
                      </p>
                    </div>
                  )}
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
                        summary.savings >= 0
                          ? "text-[var(--positive)]"
                          : "text-[var(--danger)]"
                      }`}
                    >
                      {formatCurrency(summary.savings)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mb-4 text-center">
                  <p className="text-xs text-[var(--muted)]">{copy.spend}</p>
                  <p className="mt-1 text-sm font-medium tabular-nums">
                    {formatCurrency(summary.spend)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {summary.transactionCount} transactions
                  </p>
                </div>
              )}

              {summary.categories.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--muted)]">
                  No transactions in this period.
                </p>
              ) : ledger === "personal" && !flexOnly ? (
                <div className="space-y-4">
                  {(
                    [
                      {
                        key: "discretionary",
                        label: "Discretionary",
                        rows: summary.categories.filter(
                          (c) => c.spend > 0 && c.flexibility === "discretionary",
                        ),
                        bar: "bg-[var(--danger)]",
                      },
                      {
                        key: "fixed",
                        label: "Fixed",
                        rows: summary.categories.filter(
                          (c) => c.spend > 0 && c.flexibility === "fixed",
                        ),
                        bar: "bg-[var(--accent)]",
                      },
                      {
                        key: "other",
                        label: "Other",
                        rows: summary.categories.filter(
                          (c) => c.spend <= 0 || !c.flexibility,
                        ),
                        bar: "bg-[var(--accent)]",
                      },
                    ] as const
                  )
                    .filter((g) => g.rows.length > 0)
                    .map((group) => (
                      <div key={group.key}>
                        <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                          {group.label}
                        </p>
                        <ul className="space-y-1">
                          {group.rows.map((row) => (
                            <CategoryButton
                              key={row.categoryId ?? `none-${row.name}`}
                              row={row}
                              maxSpend={maxSpend}
                              bar={group.bar}
                              formatCurrency={formatCurrency}
                              onOpen={() => void openCategory(row)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              ) : (
                <ul className="space-y-1">
                  {summary.categories
                    .filter((c) => (flexOnly ? c.spend > 0 : true))
                    .map((row) => (
                      <CategoryButton
                        key={row.categoryId ?? `none-${row.name}`}
                        row={row}
                        maxSpend={maxSpend}
                        bar={
                          row.flexibility === "discretionary"
                            ? "bg-[var(--danger)]"
                            : "bg-[var(--accent)]"
                        }
                        formatCurrency={formatCurrency}
                        onOpen={() => void openCategory(row)}
                      />
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
            txLoading || loading ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">Loading…</p>
            ) : transactions.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted)]">
                No transactions found.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {transactions.map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-start justify-between gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {tx.merchantName || tx.name}
                      </p>
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

function CategoryButton({
  row,
  maxSpend,
  bar,
  formatCurrency,
  onOpen,
}: {
  row: CategoryRow;
  maxSpend: number;
  bar: string;
  formatCurrency: (n: number) => string;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
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
              className={`h-full rounded-full ${bar}`}
              style={{
                width: `${Math.min(100, (row.spend / maxSpend) * 100)}%`,
              }}
            />
          </div>
        ) : null}
      </button>
    </li>
  );
}

/** Dashboard-compatible wrapper around BreakdownModal. */
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
  return (
    <BreakdownModal
      open={open}
      onClose={onClose}
      ledger={ledger}
      target={
        periodKey
          ? { type: "period", periodKey, granularity }
          : null
      }
    />
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLedgerGuard } from "@/components/ledger-context";
import { useMoneyFormat } from "@/components/privacy-context";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, PageHeader } from "@/components/ui";
import { formatDate, monthKey } from "@/lib/format";
import { ledgerLabel } from "@/lib/ledger-copy";
import { occurrencesInMonth, type RecurringCadence } from "@/lib/recurring";

type RecurringItem = {
  key: string;
  merchant: string;
  averageAmount: number;
  cadence: RecurringCadence;
  occurrenceCount: number;
  lastDate: string;
  nextDate: string;
  categoryName: string | null;
  isSubscription: boolean;
};

type RecurringData = {
  items: RecurringItem[];
  subscriptions: RecurringItem[];
  bills: RecurringItem[];
  totals: {
    monthlyEstimate: number;
    upcomingThisMonth: number;
    subscriptionCount: number;
    billCount: number;
  };
};

const CADENCE_LABEL: Record<RecurringCadence, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

function RecurringListSection({
  title,
  items,
  formatCurrency,
}: {
  title: string;
  items: RecurringItem[];
  formatCurrency: (n: number) => string;
}) {
  return (
    <Card>
      <h2 className="mb-4 font-display text-lg">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          None detected yet. Recurring charges appear after a few similar
          payments.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((item) => (
            <li
              key={item.key}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{item.merchant}</p>
                <p className="text-[var(--muted)]">
                  {CADENCE_LABEL[item.cadence]}
                  {item.categoryName ? ` · ${item.categoryName}` : ""}
                  {` · next ${formatDate(item.nextDate)}`}
                </p>
              </div>
              <span className="tabular-nums">
                {formatCurrency(item.averageAmount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function RecurringPage() {
  const { ledger, isCurrent } = useLedgerGuard();
  const { formatCurrency } = useMoneyFormat();
  const [data, setData] = useState<RecurringData | null>(null);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const month = monthKey();

  const load = useCallback(async () => {
    const requested = ledger;
    setError(null);
    try {
      const res = await fetch(`/api/recurring?ledger=${requested}&month=${month}`);
      const json = await res.json();
      if (!isCurrent(requested)) return;
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setData(json);
      setDataLedger(requested);
    } catch (err) {
      if (!isCurrent(requested)) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [ledger, month, isCurrent]);

  useEffect(() => {
    void load();
  }, [load]);

  const view = dataLedger === ledger ? data : null;

  const todayKey = `${month}-${String(new Date().getDate()).padStart(2, "0")}`;

  const calendarDays = useMemo(() => {
    if (!view) return [];
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const byDay = new Map<string, RecurringItem[]>();
    for (const item of view.items) {
      for (const key of occurrencesInMonth(item, month)) {
        const list = byDay.get(key) ?? [];
        list.push(item);
        byDay.set(key, list);
      }
    }
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const key = `${month}-${String(day).padStart(2, "0")}`;
      const items = [...(byDay.get(key) ?? [])].sort(
        (a, b) => b.averageAmount - a.averageAmount,
      );
      return { day, key, items };
    });
  }, [view, month]);

  return (
    <div>
      <PageHeader
        title="Recurring"
        description={`${ledgerLabel(ledger)} · bills and subscriptions detected from your history`}
      />

      {error ? (
        <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {!view ? (
        <PageSkeleton label="Loading recurring" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-[var(--muted)]">Est. monthly</p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(view.totals.monthlyEstimate)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Still due this month</p>
              <p className="mt-2 font-display text-2xl">
                {formatCurrency(view.totals.upcomingThisMonth)}
              </p>
            </Card>
            <Card>
              <p className="text-sm text-[var(--muted)]">Detected</p>
              <p className="mt-2 font-display text-2xl">
                {view.totals.billCount + view.totals.subscriptionCount}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {view.totals.subscriptionCount} subscriptions ·{" "}
                {view.totals.billCount} bills
              </p>
            </Card>
          </div>

          <Card className="mt-6">
            <h2 className="mb-1 font-display text-lg">This month</h2>
            <p className="mb-4 text-sm text-[var(--muted)]">
              Known recurring charges this month — already paid and still due
            </p>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-[var(--muted)]">
              {["M", "T", "W", "T", "F", "S", "S"].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
              {(() => {
                const [y, m] = month.split("-").map(Number);
                const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
                const blanks = Array.from({ length: firstDow }, (_, i) => (
                  <div key={`blank-${i}`} />
                ));
                return (
                  <>
                    {blanks}
                    {calendarDays.map((d) => {
                      const paid = d.key < todayKey;
                      return (
                        <div
                          key={d.key}
                          className={`min-h-14 rounded-lg border p-1 ${
                            d.items.length
                              ? paid
                                ? "border-[var(--border)] bg-[var(--surface)]"
                                : "border-[var(--gold)] bg-[var(--accent-soft)]"
                              : "border-transparent"
                          }`}
                        >
                          <div className="text-[11px] text-[var(--muted)]">
                            {d.day}
                          </div>
                          {d.items.slice(0, 2).map((item) => (
                            <div
                              key={item.key}
                              className={`truncate text-[10px] leading-tight ${
                                paid ? "text-[var(--muted)]" : "text-[var(--fg)]"
                              }`}
                              title={`${item.merchant} ${formatCurrency(item.averageAmount)}${
                                paid ? " · paid" : " · due"
                              }`}
                            >
                              {item.merchant}
                            </div>
                          ))}
                          {d.items.length > 2 ? (
                            <div className="text-[10px] text-[var(--muted)]">
                              +{d.items.length - 2}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <RecurringListSection
              title="Subscriptions"
              items={view.subscriptions}
              formatCurrency={formatCurrency}
            />
            <RecurringListSection
              title="Bills & other recurring"
              items={view.bills}
              formatCurrency={formatCurrency}
            />
          </div>
        </>
      )}
    </div>
  );
}

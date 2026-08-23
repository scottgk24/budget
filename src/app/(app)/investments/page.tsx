"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useLedgerGuard } from "@/components/ledger-context";
import { useMoneyFormat } from "@/components/privacy-context";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { CategoryPieChart } from "@/components/budget-charts";
import {
  type ManualKind,
  type NetWorthView,
} from "@/lib/net-worth";

const chartFallback = (
  <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
    Loading chart…
  </p>
);

const NetWorthTrendChart = dynamic(
  () => import("@/components/report-charts").then((m) => m.NetWorthTrendChart),
  { ssr: false, loading: () => chartFallback },
);

const KIND_OPTIONS: Array<{ value: ManualKind; label: string }> = [
  { value: "cash", label: "Cash / savings" },
  { value: "investment", label: "Investment account" },
  { value: "property", label: "Home or property" },
  { value: "vehicle", label: "Vehicle" },
  { value: "other_asset", label: "Other asset" },
  { value: "credit", label: "Credit card" },
  { value: "loan", label: "Loan or mortgage" },
];

const CLASS_ORDER = ["cash", "investments", "other_asset", "credit", "loan"];

function formatQty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatPct(n: number | null): string {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function InvestmentsPage() {
  const { ledger, isCurrent } = useLedgerGuard();
  const { formatCurrency } = useMoneyFormat();
  const [view, setView] = useState<NetWorthView | null>(null);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ManualKind>("property");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const requested = ledger;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/net-worth?ledger=${requested}`);
      const json = await res.json();
      if (!isCurrent(requested)) return;
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setView(json.view);
      setDataLedger(requested);
    } catch (err) {
      if (!isCurrent(requested)) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (isCurrent(requested)) setLoading(false);
    }
  }, [ledger, isCurrent]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedAccounts = useMemo(() => {
    if (!view) return [];
    const byClass = new Map<string, NetWorthView["accounts"]>();
    for (const row of view.accounts) {
      const list = byClass.get(row.wealthClass) ?? [];
      list.push(row);
      byClass.set(row.wealthClass, list);
    }
    return CLASS_ORDER.filter((key) => byClass.has(key)).map((key) => ({
      key,
      label: view.byClass.find((s) => s.key === key)?.label ?? key,
      rows: byClass.get(key) ?? [],
    }));
  }, [view]);

  async function addManual(e: React.FormEvent) {
    e.preventDefault();
    const currentBalance = Number(amount);
    if (!Number.isFinite(currentBalance)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/net-worth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ledger, name, kind, currentBalance }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add");
      setView(json.view);
      setName("");
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  async function updateManualBalance(id: string, current: number) {
    const raw = prompt("New value", String(Math.abs(current)));
    if (raw == null) return;
    const currentBalance = Number(raw);
    if (!Number.isFinite(currentBalance)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/net-worth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, currentBalance }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      setView(json.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function removeManual(id: string) {
    if (!confirm("Remove this manual account?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/net-worth", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to remove");
      setView(json.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setBusy(false);
    }
  }

  if (dataLedger !== ledger || (loading && !view)) {
    return <PageSkeleton label="Loading investments" />;
  }

  return (
    <div>
      <PageHeader
        title="Investments"
        description="Holdings, allocation, and linked investment accounts. Net worth lives on the dashboard."
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      {!view || view.accounts.length === 0 ? (
        <EmptyState
          title="No investments yet"
          description="Link a brokerage, or add an investment account by hand."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-1 font-display text-lg">History</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Daily snapshots after each sync. The demo includes a year of sample history.
              </p>
              <NetWorthTrendChart
                data={view.history.map((p) => ({
                  date: p.date,
                  label: p.label,
                  net: p.net,
                  assets: p.assets,
                  liabilities: p.liabilities,
                }))}
              />
            </Card>
            <Card>
              <h2 className="mb-1 font-display text-lg">Allocation</h2>
              <p className="mb-4 text-sm text-[var(--muted)]">
                Mix by account class. Brokerage lots also split by holding type.
              </p>
              <CategoryPieChart
                data={view.byClass.map((s) => ({
                  id: s.key,
                  name: s.label,
                  value: s.value,
                }))}
                emptyLabel="No balances to chart"
              />
              {view.byHoldingKind.length > 0 ? (
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <p className="mb-2 text-sm text-[var(--muted)]">Holdings mix</p>
                  <CategoryPieChart
                    data={view.byHoldingKind.map((s) => ({
                      id: s.key,
                      name: s.label,
                      value: s.value,
                    }))}
                    emptyLabel="No holding values"
                  />
                </div>
              ) : null}
            </Card>
          </div>

          <Card className="mb-6">
            <h2 className="mb-4 font-display text-lg">Accounts</h2>
            <div className="space-y-6">
              {groupedAccounts.map((group) => (
                <div key={group.key}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    {group.label}
                  </p>
                  <ul className="divide-y divide-[var(--border)]">
                    {group.rows.map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <p className="font-medium">
                            {a.name}
                            {a.mask ? ` ···${a.mask}` : ""}
                          </p>
                          <p className="text-sm text-[var(--muted)]">
                            {a.subtype ?? a.type}
                            {a.isManual ? " · manual" : ""}
                            {a.holdingCount > 0 ? ` · ${a.holdingCount} holdings` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-display text-lg tabular-nums">
                            {formatCurrency(a.signedBalance)}
                          </p>
                          {a.isManual ? (
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                className="px-2 py-1 text-xs"
                                disabled={busy}
                                onClick={() => void updateManualBalance(a.id, a.signedBalance)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="px-2 py-1 text-xs"
                                disabled={busy}
                                onClick={() => void removeManual(a.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          {view.holdings.length > 0 ? (
            <Card className="mb-6 overflow-x-auto">
              <h2 className="mb-4 font-display text-lg">Holdings</h2>
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="pb-2 font-medium">Symbol</th>
                    <th className="pb-2 font-medium">Name</th>
                    <th className="pb-2 font-medium">Account</th>
                    <th className="pb-2 text-right font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Price</th>
                    <th className="pb-2 text-right font-medium">Value</th>
                    <th className="pb-2 text-right font-medium">Gain</th>
                  </tr>
                </thead>
                <tbody>
                  {view.holdings.map((h) => (
                    <tr key={h.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 font-medium">{h.symbol ?? "—"}</td>
                      <td className="py-2">{h.name}</td>
                      <td className="py-2 text-[var(--muted)]">{h.accountName}</td>
                      <td className="py-2 text-right tabular-nums">{formatQty(h.quantity)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {h.price != null ? formatCurrency(h.price) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatCurrency(h.value)}</td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          (h.gain ?? 0) >= 0 ? "text-[var(--positive)]" : "text-[var(--danger)]"
                        }`}
                      >
                        {h.gain != null
                          ? `${formatCurrency(h.gain)} (${formatPct(h.gainPct)})`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : null}
        </>
      )}

      <Card>
        <h2 className="mb-1 font-display text-lg">Add a manual asset or debt</h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Use this for a house, car, private loan, or any account that is not linked through Plaid.
        </p>
        <form onSubmit={(e) => void addManual(e)} className="grid gap-3 sm:grid-cols-4">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Select value={kind} onChange={(e) => setKind(e.target.value as ManualKind)}>
            {KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Value"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy}>
            Add
          </Button>
        </form>
      </Card>
    </div>
  );
}

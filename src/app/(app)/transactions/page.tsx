"use client";

import { useCallback, useEffect, useState } from "react";
import { useLedger } from "@/components/ledger-context";
import { Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { formatDate, formatSignedCurrency, monthKey } from "@/lib/format";

type Category = { id: string; name: string; ledger: string };
type Tx = {
  id: string;
  name: string;
  merchantName: string | null;
  amount: number;
  date: string;
  notes: string | null;
  ledger: string;
  pending: boolean;
  categoryId: string | null;
  category: Category | null;
  account: { name: string; mask: string | null };
};

export default function TransactionsPage() {
  const { ledger } = useLedger();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ledger,
        month: monthKey(),
        limit: "200",
      });
      if (q.trim()) params.set("q", q.trim());
      const [txRes, catRes] = await Promise.all([
        fetch(`/api/transactions?${params}`),
        fetch(`/api/categories?ledger=${ledger}`),
      ]);
      const txJson = await txRes.json();
      const catJson = await catRes.json();
      if (!txRes.ok) throw new Error(txJson.error ?? "Failed to load");
      if (!catRes.ok) throw new Error(catJson.error ?? "Failed to load categories");
      setTransactions(txJson.transactions);
      setCategories(catJson.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [ledger, q]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  async function updateTx(id: string, patch: Record<string, unknown>) {
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Update failed");
      return;
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...json.transaction } : t)),
    );
  }

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={`This month · ${ledger === "personal" ? "Personal" : "Business"}`}
        actions={
          <Input
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-48"
          />
        }
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      {loading && transactions.length === 0 ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : transactions.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          description="Connect an account and sync to pull spending from Chase or Robinhood."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Ledger</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap text-[var(--muted)]">
                    {formatDate(tx.date)}
                    {tx.pending ? " · pending" : ""}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium">{tx.merchantName || tx.name}</p>
                    <p className="text-[var(--muted)]">
                      {tx.account.name}
                      {tx.account.mask ? ` ···${tx.account.mask}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={tx.categoryId ?? ""}
                      onChange={(e) =>
                        void updateTx(tx.id, {
                          categoryId: e.target.value || null,
                        })
                      }
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={tx.ledger}
                      onChange={(e) =>
                        void updateTx(tx.id, { ledger: e.target.value })
                      }
                    >
                      <option value="personal">Personal</option>
                      <option value="business">Business</option>
                    </Select>
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      tx.amount < 0 ? "text-[var(--positive)]" : ""
                    }`}
                  >
                    {formatSignedCurrency(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

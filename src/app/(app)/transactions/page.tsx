"use client";

import { useCallback, useEffect, useState } from "react";
import { useLedger } from "@/components/ledger-context";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import {
  formatDate,
  formatMonthLabel,
  formatSignedCurrency,
  monthKey,
  recentMonthKeys,
} from "@/lib/format";
import { merchantRuleKey } from "@/lib/categories";

type Category = { id: string; name: string; ledger: string };
type Account = { id: string; name: string; mask: string | null };
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
  categorySource: string | null;
  category: Category | null;
  account: { name: string; mask: string | null };
};

const MONTH_OPTIONS = recentMonthKeys(18);

export default function TransactionsPage() {
  const { ledger } = useLedger();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [month, setMonth] = useState(monthKey());
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rememberPrompt, setRememberPrompt] = useState<{
    txId: string;
    merchant: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ledger,
        month,
        limit: "200",
      });
      if (q.trim()) params.set("q", q.trim());
      if (accountId) params.set("accountId", accountId);
      if (categoryId) params.set("categoryId", categoryId);

      const [txRes, catRes, acctRes] = await Promise.all([
        fetch(`/api/transactions?${params}`),
        fetch(`/api/categories?ledger=${ledger}`),
        fetch(`/api/accounts?ledger=${ledger}`),
      ]);
      const txJson = await txRes.json();
      const catJson = await catRes.json();
      const acctJson = await acctRes.json();
      if (!txRes.ok) throw new Error(txJson.error ?? "Failed to load");
      if (!catRes.ok) throw new Error(catJson.error ?? "Failed to load categories");
      if (!acctRes.ok) throw new Error(acctJson.error ?? "Failed to load accounts");
      setTransactions(txJson.transactions);
      setCategories(catJson.categories);
      setAccounts(
        (acctJson.accounts as Account[]).map((a) => ({
          id: a.id,
          name: a.name,
          mask: a.mask,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [ledger, month, accountId, categoryId, q]);

  useEffect(() => {
    setAccountId("");
    setCategoryId("");
    setRememberPrompt(null);
  }, [ledger]);

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
      return null;
    }
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...json.transaction } : t)),
    );
    return json as {
      transaction: Tx;
      ruleApplied?: { ruleId: string; applied: number } | null;
    };
  }

  async function onCategoryChange(tx: Tx, nextCategoryId: string) {
    setNotice(null);
    const result = await updateTx(tx.id, {
      categoryId: nextCategoryId || null,
    });
    if (!result) return;

    const merchant = tx.merchantName || tx.name;
    const cleaned = merchantRuleKey(merchant);
    const cat = categories.find((c) => c.id === nextCategoryId);
    if (nextCategoryId && cleaned && cat) {
      setRememberPrompt({
        txId: tx.id,
        merchant: cleaned,
        categoryId: nextCategoryId,
        categoryName: cat.name,
      });
    } else {
      setRememberPrompt(null);
    }
  }

  async function rememberMerchant() {
    if (!rememberPrompt) return;
    const result = await updateTx(rememberPrompt.txId, {
      categoryId: rememberPrompt.categoryId,
      rememberMerchant: true,
      applyToPast: true,
    });
    if (!result) return;
    const applied = result.ruleApplied?.applied ?? 0;
    setNotice(
      `Remembered “${rememberPrompt.merchant}” as ${rememberPrompt.categoryName}` +
        (applied > 0 ? ` · updated ${applied} past transaction${applied === 1 ? "" : "s"}` : ""),
    );
    setRememberPrompt(null);
    void load();
  }

  const filterDescription = [
    formatMonthLabel(month),
    ledger === "personal" ? "Personal" : "Business",
    accountId
      ? accounts.find((a) => a.id === accountId)?.name
      : null,
    categoryId === "none"
      ? "Uncategorized"
      : categoryId
        ? categories.find((c) => c.id === categoryId)?.name
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title="Transactions"
        description={filterDescription}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Month"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </Select>
            <Select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              aria-label="Account"
            >
              <option value="">All accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.mask ? ` ···${a.mask}` : ""}
                </option>
              ))}
            </Select>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Category"
            >
              <option value="">All categories</option>
              <option value="none">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-40 sm:w-48"
            />
          </div>
        }
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-[var(--positive)]">{notice}</p> : null}

      {rememberPrompt ? (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="text-sm">
            Always categorize <span className="font-medium">{rememberPrompt.merchant}</span> as{" "}
            <span className="font-medium">{rememberPrompt.categoryName}</span>?
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setRememberPrompt(null)}>
              Not now
            </Button>
            <Button type="button" onClick={() => void rememberMerchant()}>
              Remember &amp; apply to past
            </Button>
          </div>
        </Card>
      ) : null}

      {loading && transactions.length === 0 ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : transactions.length === 0 ? (
        <EmptyState
          title="No transactions match"
          description="Try another month, account, or category — or sync after connecting a bank."
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
                      {tx.categorySource === "user"
                        ? " · manual"
                        : tx.categorySource === "rule"
                          ? " · rule"
                          : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      value={tx.categoryId ?? ""}
                      onChange={(e) => void onCategoryChange(tx, e.target.value)}
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

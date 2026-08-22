"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format, subDays } from "date-fns";
import { useLedgerGuard } from "@/components/ledger-context";
import { useMoneyFormat } from "@/components/privacy-context";
import { PageSkeleton } from "@/components/page-skeleton";
import { useAppBasePath } from "@/components/use-app-base-path";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import {
  formatDate,
  formatMonthLabel,
  METRICS_RANGES,
  metricsRange,
  monthKey,
  parseMetricsRangeId,
  recentMonthKeys,
  toDateParam,
  type MetricsRangeId,
} from "@/lib/format";
import { merchantRuleKey, OTHER_CATEGORY, REVIEW_CATEGORY } from "@/lib/categories";

type Category = { id: string; name: string; ledger: string };
type Account = { id: string; name: string; mask: string | null };
type Fund = { id: string; name: string; slug: string; kind: string };
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
  fundId: string | null;
  fundSource: string | null;
  fund: Fund | null;
  category: Category | null;
  account: { name: string; mask: string | null };
};

/** Period is either a lookback range or a single yyyy-MM month. */
type Period = MetricsRangeId | string;

const MONTH_OPTIONS = recentMonthKeys(18);
const RANGE_IDS = new Set<string>(METRICS_RANGES.map((r) => r.id));

function isRangePeriod(period: Period): period is MetricsRangeId {
  return RANGE_IDS.has(period);
}

function periodLabel(period: Period): string {
  if (isRangePeriod(period)) {
    return METRICS_RANGES.find((r) => r.id === period)?.label ?? period;
  }
  return formatMonthLabel(period);
}

function sortCategories(cats: Category[]): Category[] {
  const parking = new Set([REVIEW_CATEGORY, OTHER_CATEGORY]);
  return [...cats].sort((a, b) => {
    const ap = parking.has(a.name) ? 1 : 0;
    const bp = parking.has(b.name) ? 1 : 0;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });
}

function TransactionsPageInner() {
  const { ledger, isCurrent } = useLedgerGuard();
  const { href: appHref } = useAppBasePath();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { formatSignedCurrency } = useMoneyFormat();
  const [transactions, setTransactions] = useState<Tx[]>([]);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [period, setPeriod] = useState<Period>(monthKey());
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [filterLedger, setFilterLedger] = useState(ledger);
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

  const needsReview = searchParams.get("needsReview") === "1";
  const merchantFilter = searchParams.get("merchant")?.trim() || "";

  if (filterLedger !== ledger) {
    setFilterLedger(ledger);
    setAccountId("");
    setCategoryId("");
    setRememberPrompt(null);
  }

  function setNeedsReviewFilter(next: boolean) {
    if (next) setCategoryId("");
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("needsReview", "1");
    else params.delete("needsReview");
    const qs = params.toString();
    router.replace(appHref(qs ? `/transactions?${qs}` : "/transactions"), { scroll: false });
  }

  function setMerchantFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("merchant", next);
    else params.delete("merchant");
    const qs = params.toString();
    router.replace(appHref(qs ? `/transactions?${qs}` : "/transactions"), { scroll: false });
  }

  const sortedCategories = useMemo(
    () => sortCategories(categories),
    [categories],
  );
  const filterCategories = useMemo(
    () =>
      sortedCategories.filter(
        (c) => c.name !== REVIEW_CATEGORY && c.name !== OTHER_CATEGORY,
      ),
    [sortedCategories],
  );

  const load = useCallback(async () => {
    const requested = ledger;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        ledger: requested,
        limit: "500",
      });
      if (needsReview) {
        params.set("needsReview", "1");
        params.set("from", format(subDays(new Date(), 90), "yyyy-MM-dd"));
        params.set("to", format(new Date(), "yyyy-MM-dd"));
      } else if (isRangePeriod(period)) {
        if (period !== "all") {
          const { start, end } = metricsRange(period);
          params.set("from", toDateParam(start));
          params.set("to", toDateParam(end));
        }
        if (categoryId) params.set("categoryId", categoryId);
      } else {
        params.set("month", period);
        if (categoryId) params.set("categoryId", categoryId);
      }
      if (q.trim()) params.set("q", q.trim());
      if (accountId) params.set("accountId", accountId);
      if (merchantFilter) params.set("merchant", merchantFilter);

      const [txRes, catRes, acctRes, fundRes] = await Promise.all([
        fetch(`/api/transactions?${params}`),
        fetch(`/api/categories?ledger=${requested}`),
        fetch(`/api/accounts?ledger=${requested}`),
        requested === "personal" ? fetch("/api/funds") : Promise.resolve(null),
      ]);
      const txJson = await txRes.json();
      const catJson = await catRes.json();
      const acctJson = await acctRes.json();
      if (!isCurrent(requested)) return;
      if (!txRes.ok) throw new Error(txJson.error ?? "Failed to load");
      if (!catRes.ok) throw new Error(catJson.error ?? "Failed to load categories");
      if (!acctRes.ok) throw new Error(acctJson.error ?? "Failed to load accounts");
      setTransactions(txJson.transactions);
      setDataLedger(requested);
      setCategories(catJson.categories);
      if (fundRes) {
        const fundJson = await fundRes.json();
        if (fundRes.ok) setFunds(fundJson.funds ?? []);
      } else {
        setFunds([]);
      }
      setAccounts(
        (acctJson.accounts as Account[]).map((a) => ({
          id: a.id,
          name: a.name,
          mask: a.mask,
        })),
      );
    } catch (err) {
      if (!isCurrent(requested)) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (isCurrent(requested)) setLoading(false);
    }
  }, [ledger, period, accountId, categoryId, needsReview, q, merchantFilter, isCurrent]);

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
    if (
      nextCategoryId &&
      cleaned &&
      cat &&
      cat.name !== REVIEW_CATEGORY
    ) {
      setRememberPrompt({
        txId: tx.id,
        merchant: cleaned,
        categoryId: nextCategoryId,
        categoryName: cat.name,
      });
    } else {
      setRememberPrompt(null);
    }

    if (needsReview) {
      const stillQueued =
        !nextCategoryId ||
        cat?.name === REVIEW_CATEGORY ||
        cat?.name === OTHER_CATEGORY;
      if (!stillQueued) {
        setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
      }
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
    needsReview ? "Last 90 days" : periodLabel(period),
    ledger === "personal" ? "Personal" : "Business",
    accountId
      ? accounts.find((a) => a.id === accountId)?.name
      : null,
    needsReview
      ? "Needs review"
      : categoryId === "none"
        ? "Uncategorized"
        : categoryId
          ? categories.find((c) => c.id === categoryId)?.name
          : null,
    merchantFilter ? merchantFilter : null,
    q.trim() ? `“${q.trim()}”` : null,
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
            {!needsReview ? (
              <Select
                value={period}
                onChange={(e) => {
                  const v = e.target.value;
                  setPeriod(isRangePeriod(v) ? parseMetricsRangeId(v) : v);
                }}
                aria-label="Period"
              >
                <optgroup label="Range">
                  {METRICS_RANGES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Month">
                  {MONTH_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {formatMonthLabel(m)}
                    </option>
                  ))}
                </optgroup>
              </Select>
            ) : null}
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
              value={needsReview ? "needsReview" : categoryId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "needsReview") {
                  setNeedsReviewFilter(true);
                } else {
                  setNeedsReviewFilter(false);
                  setCategoryId(v);
                }
              }}
              aria-label="Category"
            >
              <option value="">All categories</option>
              <option value="needsReview">Needs review (queue)</option>
              <option value="none">Uncategorized</option>
              {filterCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Input
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-40 sm:w-56"
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

      {merchantFilter ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Merchant</span>
          <span className="rounded-md bg-[var(--accent-soft)] px-2 py-1 font-medium">
            {merchantFilter}
          </span>
          <Button type="button" variant="ghost" onClick={() => setMerchantFilter("")}>
            Clear
          </Button>
        </div>
      ) : null}

      {dataLedger !== ledger ? (
        <PageSkeleton label="Loading transactions" />
      ) : loading && transactions.length === 0 ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : transactions.length === 0 ? (
        <EmptyState title="No transactions" />
      ) : (
        <>
          {transactions.length >= 500 ? (
            <p className="mb-3 text-sm text-[var(--muted)]">
              Showing the 500 most recent matches. Narrow the period or search to see more.
            </p>
          ) : null}
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  {ledger === "personal" ? (
                    <th className="px-4 py-3 font-medium">Fund</th>
                  ) : null}
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
                        {sortedCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name === REVIEW_CATEGORY
                              ? "Review (unsure)"
                              : c.name}
                          </option>
                        ))}
                      </Select>
                    </td>
                    {ledger === "personal" ? (
                      <td className="px-4 py-3">
                        <Select
                          value={tx.fundId ?? ""}
                          onChange={(e) =>
                            void updateTx(tx.id, { fundId: e.target.value || null })
                          }
                        >
                          {funds
                            .filter((f) => f.kind !== "buffer")
                            .map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                        </Select>
                      </td>
                    ) : null}
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
        </>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<p className="text-[var(--muted)]">Loading…</p>}>
      <TransactionsPageInner />
    </Suspense>
  );
}

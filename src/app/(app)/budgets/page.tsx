"use client";

import { useCallback, useEffect, useState } from "react";
import { useLedger } from "@/components/ledger-context";
import { Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatCurrency, monthKey } from "@/lib/format";

type Category = { id: string; name: string };
type Budget = { id: string; categoryId: string; amount: number; category: Category };

export default function BudgetsPage() {
  const { ledger } = useLedger();
  const month = monthKey();
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [spentByCategory, setSpentByCategory] = useState<Record<string, number>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/budgets?ledger=${ledger}&month=${month}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Failed to load");
      return;
    }
    setCategories(json.categories);
    setBudgets(json.budgets);
    setSpentByCategory(json.spentByCategory ?? {});
    const next: Record<string, string> = {};
    for (const cat of json.categories as Category[]) {
      const b = (json.budgets as Budget[]).find((x) => x.categoryId === cat.id);
      next[cat.id] = b ? String(b.amount) : "";
    }
    setDrafts(next);
  }, [ledger, month]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(categoryId: string) {
    setSaving(categoryId);
    setError(null);
    try {
      const amount = Number(drafts[categoryId] || 0);
      const res = await fetch("/api/budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, ledger, month, amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(null);
    }
  }

  const skip = new Set(["Income", "Transfers"]);
  const rows = categories.filter((c) => !skip.has(c.name));

  return (
    <div>
      <PageHeader
        title="Budgets"
        description={`Monthly limits for ${ledger === "personal" ? "Personal" : "Business"} · ${month}`}
      />

      {error ? <p className="mb-4 text-sm text-[var(--danger)]">{error}</p> : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No categories yet"
          description="Categories are created when your workspace is set up."
        />
      ) : (
        <div className="grid gap-3">
          {rows.map((cat) => {
            const spent = spentByCategory[cat.id] ?? 0;
            const budgetAmt = Number(drafts[cat.id] || 0);
            const pct = budgetAmt > 0 ? Math.min(100, (spent / budgetAmt) * 100) : 0;
            return (
              <Card key={cat.id} className="flex flex-wrap items-center gap-4">
                <div className="min-w-[140px] flex-1">
                  <p className="font-medium">{cat.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    Spent {formatCurrency(spent)}
                    {budgetAmt > 0 ? ` of ${formatCurrency(budgetAmt)}` : ""}
                  </p>
                  {budgetAmt > 0 ? (
                    <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-[var(--bg)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    placeholder="0"
                    className="w-28"
                    value={drafts[cat.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [cat.id]: e.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={saving === cat.id}
                    onClick={() => void save(cat.id)}
                  >
                    {saving === cat.id ? "Saving…" : "Save"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

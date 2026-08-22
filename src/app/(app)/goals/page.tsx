"use client";

import { useCallback, useEffect, useState } from "react";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { useLedgerGuard } from "@/components/ledger-context";
import { useMoneyFormat } from "@/components/privacy-context";
import { PageSkeleton } from "@/components/page-skeleton";
import { Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ledgerLabel } from "@/lib/ledger-copy";

type Goal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string | null;
  notes: string | null;
};

function progressPct(goal: Goal): number {
  if (goal.targetAmount <= 0) return 0;
  return Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
}

function paceLabel(goal: Goal): string | null {
  if (!goal.targetDate) return null;
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return "Goal reached";
  const daysLeft = differenceInCalendarDays(parseISO(goal.targetDate), new Date());
  if (daysLeft <= 0) return "Past target date";
  const perMonth = (remaining / daysLeft) * 30;
  return `~$${perMonth.toFixed(0)}/mo to finish on time`;
}

export default function GoalsPage() {
  const { ledger, isCurrent } = useLedgerGuard();
  const { formatCurrency } = useMoneyFormat();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [currentAmount, setCurrentAmount] = useState("0");
  const [targetDate, setTargetDate] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const requested = ledger;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/goals?ledger=${requested}`);
      const json = await res.json();
      if (!isCurrent(requested)) return;
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setGoals(json.goals);
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

  async function createGoal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ledger,
          name,
          targetAmount: Number(targetAmount),
          currentAmount: Number(currentAmount) || 0,
          targetDate: targetDate || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create");
      setName("");
      setTargetAmount("");
      setCurrentAmount("0");
      setTargetDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  }

  async function updateProgress(goal: Goal, nextAmount: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/goals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: goal.id, currentAmount: nextAmount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to update");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setBusy(false);
    }
  }

  async function removeGoal(id: string) {
    if (!confirm("Delete this goal?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/goals?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to delete");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Goals"
        description={`${ledgerLabel(ledger)} · save toward targets with a clear timeline`}
      />

      {error ? (
        <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      <Card className="mb-6">
        <h2 className="mb-4 font-display text-lg">New goal</h2>
        <form
          onSubmit={(e) => void createGoal(e)}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Target $"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            required
          />
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Saved so far"
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
          />
          <Input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
          <Button type="submit" disabled={busy || !name || !targetAmount}>
            Add goal
          </Button>
        </form>
      </Card>

      {dataLedger !== ledger ? (
        <PageSkeleton label="Loading goals" />
      ) : loading && goals.length === 0 ? (
        <p className="text-[var(--muted)]">Loading…</p>
      ) : goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Add an emergency fund, trip, or down payment to track progress."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((goal) => {
            const pct = progressPct(goal);
            const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
            const pace = paceLabel(goal);
            return (
              <Card key={goal.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg">{goal.name}</h3>
                    {goal.targetDate ? (
                      <p className="mt-0.5 text-sm text-[var(--muted)]">
                        Target {formatDate(goal.targetDate)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                    onClick={() => void removeGoal(goal.id)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                </div>

                <div className="mt-4 flex items-end justify-between text-sm">
                  <span className="tabular-nums">
                    {formatCurrency(goal.currentAmount)}
                    <span className="text-[var(--muted)]">
                      {" "}
                      / {formatCurrency(goal.targetAmount)}
                    </span>
                  </span>
                  <span className="text-[var(--muted)]">{pct.toFixed(0)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bg)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  {remaining > 0
                    ? `${formatCurrency(remaining)} remaining`
                    : "Complete"}
                  {pace ? ` · ${pace}` : ""}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {[50, 100, 250].map((add) => (
                    <Button
                      key={add}
                      type="button"
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      disabled={busy}
                      onClick={() =>
                        void updateProgress(goal, goal.currentAmount + add)
                      }
                    >
                      +{formatCurrency(add)}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2.5 py-1 text-xs"
                    disabled={busy || goal.currentAmount <= 0}
                    onClick={() => {
                      const raw = prompt(
                        "Set current amount",
                        String(goal.currentAmount),
                      );
                      if (raw == null) return;
                      const next = Number(raw);
                      if (!Number.isFinite(next) || next < 0) return;
                      void updateProgress(goal, next);
                    }}
                  >
                    Set amount
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

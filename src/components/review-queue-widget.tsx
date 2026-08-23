"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useLedgerGuard } from "@/components/ledger-context";
import { useMoneyFormat } from "@/components/privacy-context";
import { useAppBasePath } from "@/components/use-app-base-path";
import { cn, formatDate } from "@/lib/format";

type ReviewReason = "review" | "uncategorized" | "other" | "misfit";

type ReviewItem = {
  id: string;
  name: string;
  merchantName: string | null;
  amount: number;
  date: string;
  pending: boolean;
  reason: ReviewReason;
  account: { name: string; mask: string | null };
  misfit?: {
    suggestedKind: "personal" | "business";
    reason: string;
    suggestedLedger: string;
    suggestedName: string;
  };
};

type ReviewQueueData = {
  total: number;
  recentTotal?: number;
  olderTotal?: number;
  counts: { review: number; uncategorized: number; other: number; misfit?: number };
  items: ReviewItem[];
  olderItems?: ReviewItem[];
  misfitItems?: ReviewItem[];
};

const REASON_LABEL: Record<ReviewReason, string> = {
  review: "Review",
  uncategorized: "Uncategorized",
  other: "Other",
  misfit: "Wrong ledger",
};

function IconBell({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
      className={cn("h-[1.125rem] w-[1.125rem] shrink-0", className)}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5Z"
      />
      <path strokeLinecap="round" d="M10 18.5a2 2 0 0 0 4 0" />
    </svg>
  );
}

export function ReviewQueueWidget({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const { ledger, isCurrent } = useLedgerGuard();
  const { href: appHref } = useAppBasePath();
  const { formatSignedCurrency } = useMoneyFormat();
  const [open, setOpen] = useState(false);
  const [olderOpen, setOlderOpen] = useState(false);
  const [data, setData] = useState<ReviewQueueData | null>(null);
  const [dataLedger, setDataLedger] = useState<string | null>(null);
  const [panelLedger, setPanelLedger] = useState(ledger);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  if (panelLedger !== ledger) {
    setPanelLedger(ledger);
    setOpen(false);
  }

  const load = useCallback(async () => {
    const requested = ledger;
    try {
      const res = await fetch(`/api/review-queue?ledger=${requested}&limit=16`);
      const json = await res.json();
      if (!isCurrent(requested) || !res.ok) return;
      setData(json);
      setDataLedger(requested);
    } catch {
      // Keep last good data; widget is non-critical.
    }
  }, [ledger, isCurrent]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const view = dataLedger === ledger ? data : null;
  const recentTotal = view?.recentTotal ?? 0;
  const olderTotal = view?.olderTotal ?? 0;
  const olderItems = view?.olderItems ?? [];
  const misfitItems = view?.misfitItems ?? [];
  const misfitTotal = view?.counts.misfit ?? misfitItems.length;
  const badgeTotal = recentTotal + misfitTotal;
  const viewAllHref = appHref("/transactions?needsReview=1");

  async function moveMisfit(item: ReviewItem) {
    if (!item.misfit) return;
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, ledger: item.misfit.suggestedLedger }),
    });
    void load();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          void load();
        }}
        className={cn(
          "relative rounded-md p-2 text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--fg)]",
          open && "bg-[var(--accent-soft)] text-[var(--fg)]",
          badgeTotal > 0 && "text-[var(--gold)]",
        )}
        aria-label={
          recentTotal > 0
            ? `Review queue, ${badgeTotal} item${badgeTotal === 1 ? "" : "s"}`
            : "Review queue"
        }
        aria-expanded={open}
        aria-controls={panelId}
        title="Needs review"
      >
        <IconBell />
        {badgeTotal > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[0.65rem] font-semibold text-[var(--on-accent)]">
            {badgeTotal > 99 ? "99+" : badgeTotal}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Needs review"
          className={cn(
            "absolute z-50 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]",
            collapsed
              ? "bottom-0 left-full ml-2"
              : "bottom-full left-0 mb-2 origin-bottom-left",
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-3.5 py-3">
            <div>
              <p className="text-sm font-medium">Needs review</p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                {recentTotal === 0 && olderTotal === 0
                  ? "Queue is clear"
                  : recentTotal === 0
                    ? `${olderTotal} older than 30 days`
                    : `${recentTotal} from the last 30 days`}
              </p>
            </div>
            <Link
              href={viewAllHref}
              onClick={() => setOpen(false)}
              className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline"
            >
              View all
            </Link>
          </div>

          {view && (recentTotal > 0 || olderTotal > 0) ? (
            <div className="flex gap-2 border-b border-[var(--border)] px-3.5 py-2 text-[0.7rem] text-[var(--muted)]">
              <span>Review {view.counts.review}</span>
              <span aria-hidden>·</span>
              <span>Uncat. {view.counts.uncategorized}</span>
              <span aria-hidden>·</span>
              <span>Other {view.counts.other}</span>
              {misfitTotal > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Misfit {misfitTotal}</span>
                </>
              ) : null}
            </div>
          ) : null}

          {misfitItems.length > 0 ? (
            <div className="border-b border-[var(--border)]">
              <p className="px-3.5 pt-2 text-[0.7rem] font-medium uppercase tracking-wide text-[var(--muted)]">
                Might belong elsewhere
              </p>
              <ul className="max-h-48 overflow-y-auto py-1">
                {misfitItems.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2 px-3.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.merchantName || item.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {item.misfit?.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                      onClick={() => void moveMisfit(item)}
                    >
                      Move to {item.misfit?.suggestedName}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {view && view.items.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto py-1">
              {view.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={viewAllHref}
                    onClick={() => setOpen(false)}
                    className="flex items-start justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--accent-soft)]/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.merchantName || item.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                        {REASON_LABEL[item.reason]} · {formatDate(item.date)}
                        {item.pending ? " · pending" : ""}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm tabular-nums",
                        item.amount < 0 && "text-[var(--positive)]",
                      )}
                    >
                      {formatSignedCurrency(item.amount)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : recentTotal === 0 && olderTotal === 0 && misfitTotal === 0 ? (
            <p className="px-3.5 py-8 text-center text-sm text-[var(--muted)]">
              Nothing waiting right now.
            </p>
          ) : null}

          {olderTotal > 0 ? (
            <div className="border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setOlderOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-medium text-[var(--muted)] hover:bg-[var(--accent-soft)]/40"
              >
                <span>Older ({olderTotal})</span>
                <span aria-hidden>{olderOpen ? "Hide" : "Show"}</span>
              </button>
              {olderOpen ? (
                <ul className="max-h-48 overflow-y-auto py-1">
                  {olderItems.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={viewAllHref}
                        onClick={() => setOpen(false)}
                        className="flex items-start justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-[var(--accent-soft)]/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {item.merchantName || item.name}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                            {REASON_LABEL[item.reason]} · {formatDate(item.date)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums">
                          {formatSignedCurrency(item.amount)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

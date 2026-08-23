"use client";

import { useMoneyFormat } from "@/components/privacy-context";
import { defaultFundSlugForCategoryName, fundKindForSlug } from "@/lib/categories";

type MerchantRow = {
  merchant: string;
  amount: number;
  count: number;
  categoryName?: string | null;
};

function barColor(categoryName: string | null | undefined, colorByFlexibility: boolean): string {
  if (!colorByFlexibility || !categoryName) return "bg-[var(--gold)]";
  const kind = fundKindForSlug(defaultFundSlugForCategoryName(categoryName));
  if (kind === "flexible") return "bg-[var(--flexible)]";
  if (kind === "committed") return "bg-[var(--olive)]";
  return "bg-[var(--gold)]";
}

export function MerchantList({
  data,
  colorByFlexibility = false,
  onSelect,
}: {
  data: MerchantRow[];
  colorByFlexibility?: boolean;
  onSelect?: (row: MerchantRow) => void;
}) {
  const { formatCurrency } = useMoneyFormat();
  const max = data[0]?.amount ?? 0;

  if (data.length === 0) {
    return (
      <p className="flex h-72 items-center justify-center text-sm text-[var(--muted)]">
        No merchant spending in this range.
      </p>
    );
  }

  return (
    <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
      {data.map((row) => {
        const pct = max > 0 ? Math.max(4, (row.amount / max) * 100) : 0;
        const meta = [
          row.categoryName,
          `${row.count} tx`,
        ].filter(Boolean).join(" · ");
        const label = `${row.merchant}, ${formatCurrency(row.amount)}`;
        const inner = (
          <>
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 text-sm font-medium leading-snug wrap-break-word">
                {row.merchant}
              </p>
              <span className="shrink-0 tabular-nums text-sm">
                {formatCurrency(row.amount)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--border)]/50">
              <div
                className={`h-full rounded-full ${barColor(row.categoryName, colorByFlexibility)}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {meta ? (
              <p className="mt-1 truncate text-[11px] text-[var(--muted)]">{meta}</p>
            ) : null}
          </>
        );

        return (
          <li key={row.merchant}>
            {onSelect ? (
              <button
                type="button"
                className="w-full rounded-lg px-2 py-2 text-left transition hover:bg-[var(--bg)]"
                onClick={() => onSelect(row)}
                aria-label={label}
                title={row.merchant}
              >
                {inner}
              </button>
            ) : (
              <div className="px-2 py-2" title={row.merchant}>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

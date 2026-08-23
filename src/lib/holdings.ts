/** Display helpers for Plaid holdings already stored on linked accounts. */

export type HoldingLike = {
  id: string;
  name: string;
  symbol: string | null;
  value: number | null;
  quantity: number;
  accountId?: string;
  isoCurrencyCode?: string | null;
};

const DUST = 0.005;

function cashBucketKey(h: HoldingLike): string | null {
  const symbol = (h.symbol ?? "").toUpperCase();
  if (symbol.startsWith("CUR:")) {
    return `cash:${symbol.slice(4) || h.isoCurrencyCode || "USD"}`;
  }
  const name = h.name.toLowerCase();
  if (
    name.includes("currency") ||
    name === "usd" ||
    name.includes("cash") ||
    symbol === "USD"
  ) {
    return `cash:${(h.isoCurrencyCode || symbol || "USD").toUpperCase()}`;
  }
  return null;
}

/**
 * Collapse duplicate cash/currency lots and drop worthless dust.
 * Does not invent holdings — only reshapes rows Plaid already returned.
 */
export function normalizeHoldings<T extends HoldingLike>(
  holdings: T[],
  opts?: { showZeroLots?: boolean },
): T[] {
  const visible = opts?.showZeroLots
    ? holdings
    : holdings.filter((h) => (h.value ?? 0) > DUST);

  const byKey = new Map<string, T>();
  for (const h of visible) {
    const cash = cashBucketKey(h);
    const key =
      cash ?? `${h.accountId ?? ""}:${(h.symbol || h.name).toUpperCase()}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...h });
      continue;
    }
    const ev = existing.value ?? 0;
    const nv = h.value ?? 0;
    if (Math.abs(ev - nv) < 0.02) continue;
    byKey.set(key, {
      ...existing,
      value: ev + nv,
      quantity: existing.quantity + h.quantity,
    });
  }

  return [...byKey.values()].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
}

export function isCurrencyHolding(h: { symbol: string | null; name: string }): boolean {
  const symbol = (h.symbol ?? "").toUpperCase();
  if (symbol.startsWith("CUR:")) return true;
  const name = h.name.toLowerCase();
  return name.includes("currency") || name.includes("cash") || symbol === "USD";
}

/** Spendable USD cash lots (CUR:USD, named cash) — not BTC, stocks, or FX. */
export function isUsdCashHolding(h: {
  symbol: string | null;
  name: string;
  isoCurrencyCode?: string | null;
}): boolean {
  if (!isCurrencyHolding(h)) return false;
  const symbol = (h.symbol ?? "").toUpperCase();
  if (symbol.startsWith("CUR:")) {
    const code = symbol.slice(4);
    return code === "" || code === "USD";
  }
  const iso = (h.isoCurrencyCode ?? "").toUpperCase();
  return iso === "USD" || iso === "" || symbol === "USD";
}

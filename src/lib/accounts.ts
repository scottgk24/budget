import {
  isUsdCashHolding,
  normalizeHoldings,
  type HoldingLike,
} from "@/lib/holdings";

/**
 * Plaid account balance helpers.
 *
 * For depository/investment, `current` is cash/value held (asset).
 * For credit/loan, `current` is typically the amount owed (liability) —
 * positive in Plaid's API, so it must be negated for net worth.
 */

const LIABILITY_TYPES = new Set(["credit", "loan"]);

export function isLiabilityAccountType(type: string): boolean {
  return LIABILITY_TYPES.has(type.toLowerCase());
}

/** Balance contribution to net worth (liabilities are negative). */
export function signedAccountBalance(
  type: string,
  currentBalance: number | null | undefined,
): number {
  const raw = currentBalance ?? 0;
  return isLiabilityAccountType(type) ? -Math.abs(raw) : raw;
}

export function sumNetBalances(
  accounts: Array<{ type: string; currentBalance: number | null }>,
): number {
  return accounts.reduce(
    (sum, a) => sum + signedAccountBalance(a.type, a.currentBalance),
    0,
  );
}

export type BalanceSplit = {
  cash: number;
  otherAssets: number;
  creditCards: number;
  net: number;
};

export type SplitAccount = {
  id?: string;
  type: string;
  currentBalance: number | null;
};

export type SplitHolding = Pick<
  HoldingLike,
  "name" | "symbol" | "value" | "accountId" | "isoCurrencyCode"
> & {
  id?: string;
  quantity?: number;
};

function usdCashByAccount(holdings: SplitHolding[]): Map<string, number> {
  const grouped = new Map<string, HoldingLike[]>();
  holdings.forEach((h, i) => {
    const accountId = h.accountId ?? "";
    const list = grouped.get(accountId) ?? [];
    list.push({
      id: h.id ?? `holding-${i}`,
      name: h.name,
      symbol: h.symbol,
      value: h.value,
      quantity: h.quantity ?? 0,
      accountId: h.accountId,
      isoCurrencyCode: h.isoCurrencyCode,
    });
    grouped.set(accountId, list);
  });

  const cash = new Map<string, number>();
  for (const [accountId, list] of grouped) {
    const amount = normalizeHoldings(list)
      .filter(isUsdCashHolding)
      .reduce((sum, h) => sum + (h.value ?? 0), 0);
    if (amount > 0) cash.set(accountId, amount);
  }
  return cash;
}

/**
 * Split already-linked accounts for the Personal headline.
 * Cash = depository (checking/savings) plus USD currency lots on
 * brokerage/investment accounts. Do not treat the whole brokerage
 * balance as cash — stocks/crypto stay in `otherAssets`.
 * Credit cards are a positive "owe". Loans stay in `net` only.
 */
export function splitAccountBalances(
  accounts: SplitAccount[],
  holdings: SplitHolding[] = [],
): BalanceSplit {
  const brokerageCash = usdCashByAccount(holdings);
  let cash = 0;
  let otherAssets = 0;
  let creditCards = 0;
  for (const a of accounts) {
    const type = a.type.toLowerCase();
    const raw = a.currentBalance ?? 0;
    if (type === "credit") {
      creditCards += Math.abs(raw);
    } else if (type === "loan") {
      continue;
    } else if (type === "depository") {
      cash += raw;
    } else {
      const fromHoldings = a.id ? (brokerageCash.get(a.id) ?? 0) : 0;
      const cashSlice = Math.min(Math.max(0, fromHoldings), Math.max(0, raw));
      cash += cashSlice;
      otherAssets += Math.max(0, raw - cashSlice);
    }
  }
  return {
    cash,
    otherAssets,
    creditCards,
    net: sumNetBalances(accounts),
  };
}

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

/**
 * Split already-linked accounts for the Personal headline.
 * Cash = depository (checking/savings). Credit cards are a positive "owe".
 * Loans are left in `net` only — do not surface a mortgage/loan line.
 */
export function splitAccountBalances(
  accounts: Array<{ type: string; currentBalance: number | null }>,
): BalanceSplit {
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
      otherAssets += raw;
    }
  }
  return {
    cash,
    otherAssets,
    creditCards,
    net: sumNetBalances(accounts),
  };
}

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

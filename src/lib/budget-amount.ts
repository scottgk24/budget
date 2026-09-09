/** Budget.month is `yyyy-MM` for monthly categories and `yyyy` for annual. */
const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

export function isMonthPeriodKey(key: string): boolean {
  return MONTH_KEY_RE.test(key);
}

export type PeriodBudget = {
  categoryId: string;
  month: string;
  amount: number;
};

/** Sorted ascending by month, monthly keys only. */
export function indexMonthlyBudgets(
  rows: PeriodBudget[],
): Map<string, Array<{ month: string; amount: number }>> {
  const byCat = new Map<string, Array<{ month: string; amount: number }>>();
  for (const row of rows) {
    if (!isMonthPeriodKey(row.month)) continue;
    const list = byCat.get(row.categoryId) ?? [];
    list.push({ month: row.month, amount: row.amount });
    byCat.set(row.categoryId, list);
  }
  for (const list of byCat.values()) {
    list.sort((a, b) => a.month.localeCompare(b.month));
  }
  return byCat;
}

/**
 * Amount in force for `month` (`yyyy-MM`): the last monthly budget on or
 * before that month. A monthly budget persists until a later month overrides it.
 * `null` if this category has never had a monthly budget on or before `month`.
 */
export function standingMonthlyAmountOrNull(
  rows: Array<{ month: string; amount: number }> | undefined,
  month: string,
): number | null {
  if (!rows || rows.length === 0) return null;
  let found = false;
  let amount = 0;
  for (const row of rows) {
    if (row.month > month) break;
    found = true;
    amount = row.amount;
  }
  return found ? amount : null;
}

export function standingMonthlyAmount(
  rows: Array<{ month: string; amount: number }> | undefined,
  month: string,
): number {
  return standingMonthlyAmountOrNull(rows, month) ?? 0;
}

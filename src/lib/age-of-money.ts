import { differenceInCalendarDays, format } from "date-fns";
import { isIncomeAmount, isSpendAmount } from "@/lib/categories";

export type TxForAge = {
  amount: number;
  date: Date;
  categoryName: string | null;
};

export type AgeOfMoneyPoint = {
  date: string;
  ageDays: number;
};

/**
 * YNAB-style Age of Money approximation.
 * FIFO: each spend consumes the oldest remaining income dollars; age is the
 * average lag (in days) between those income deposits and the spend.
 * Returns the current age (last 10 spends) and a daily series of rolling ages.
 */
export function computeAgeOfMoney(
  transactions: TxForAge[],
  lookbackSpendCount = 10,
): {
  ageDays: number | null;
  series: AgeOfMoneyPoint[];
} {
  const sorted = [...transactions].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  type Lot = { remaining: number; date: Date };
  const lots: Lot[] = [];
  const spendAges: Array<{ date: Date; age: number }> = [];

  for (const tx of sorted) {
    if (isIncomeAmount(tx.amount, tx.categoryName)) {
      lots.push({ remaining: Math.abs(tx.amount), date: tx.date });
      continue;
    }
    if (!isSpendAmount(tx.amount, tx.categoryName)) continue;

    // Refunds restore cash as a new lot; they do not consume income.
    if (tx.amount < 0) {
      lots.push({ remaining: Math.abs(tx.amount), date: tx.date });
      continue;
    }

    let need = tx.amount;
    let weightedAge = 0;
    let covered = 0;

    while (need > 0.005 && lots.length > 0) {
      const lot = lots[0];
      const take = Math.min(lot.remaining, need);
      weightedAge += take * differenceInCalendarDays(tx.date, lot.date);
      covered += take;
      lot.remaining -= take;
      need -= take;
      if (lot.remaining < 0.005) lots.shift();
    }

    if (covered > 0) {
      spendAges.push({ date: tx.date, age: weightedAge / covered });
    }
  }

  if (spendAges.length === 0) {
    return { ageDays: null, series: [] };
  }

  const recent = spendAges.slice(-lookbackSpendCount);
  const ageDays =
    Math.round(
      (recent.reduce((sum, s) => sum + s.age, 0) / recent.length) * 10,
    ) / 10;

  // Collapse to one point per calendar day (last age that day)
  const byDay = new Map<string, number>();
  for (const s of spendAges) {
    byDay.set(format(s.date, "yyyy-MM-dd"), Math.round(s.age * 10) / 10);
  }
  const series = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ageDays]) => ({ date, ageDays }));

  return { ageDays, series };
}

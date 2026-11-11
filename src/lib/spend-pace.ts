/**
 * Ideal cumulative spend for day `dayIndex` (0-based).
 *
 * Committed / lumpy budget is recognized on day 1 (`frontLoadedAmount`); only
 * the remainder burns evenly across the month. That way a mortgage on day 1
 * does not make Actual look "behind" an even daily burn of the full envelope.
 */
export function idealPaceAmount(params: {
  dayIndex: number;
  dayCount: number;
  budgetTotal: number;
  frontLoadedAmount?: number;
}): number {
  const { dayIndex, dayCount, budgetTotal } = params;
  if (budgetTotal <= 0 || dayCount <= 0 || dayIndex < 0) return 0;
  const front = Math.min(
    Math.max(0, params.frontLoadedAmount ?? 0),
    budgetTotal,
  );
  const evenBurn = budgetTotal - front;
  const paced = evenBurn > 0 ? (evenBurn * (dayIndex + 1)) / dayCount : 0;
  return Math.round((front + paced) * 100) / 100;
}

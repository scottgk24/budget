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

/**
 * Y-axis domain for Month pace. When `elevateFloor` is set (All-funds view with
 * a committed front-load), start slightly below that floor so the chart isn't
 * half empty below the mortgage. Other filters keep a $0 baseline.
 */
export function spendPaceYDomain(params: {
  budgetTotal: number;
  ideals: number[];
  actuals: number[];
  /** Front-loaded committed/reserve amount; only elevates when > 0 and elevateFloor. */
  frontLoadedAmount?: number;
  elevateFloor?: boolean;
}): [number, number] {
  const { budgetTotal, ideals, actuals } = params;
  const seriesMax = Math.max(budgetTotal, ...ideals, ...actuals, 0);
  const seriesMin = Math.min(
    ...ideals,
    ...(actuals.length > 0 ? actuals : [0]),
    seriesMax,
  );
  const yMax = Math.max(seriesMax, 1);

  const front = Math.max(0, params.frontLoadedAmount ?? 0);
  if (!params.elevateFloor || front <= 0) {
    return [0, yMax];
  }

  const pad = Math.max(front * 0.04, 25);
  let yMin = Math.max(0, front - pad);
  // Don't clip Actual if it sits below the front-load (e.g. mortgage not posted yet).
  if (seriesMin < yMin) {
    yMin = Math.max(0, seriesMin - pad);
  }
  // If that collapses us near zero, just use $0.
  if (yMin < yMax * 0.08) {
    return [0, yMax];
  }
  return [Math.min(yMin, yMax - 1), yMax];
}

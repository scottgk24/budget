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
 * Projected cumulative spend for day `dayIndex` (0-based).
 *
 * Lumpy front-load (Housing / mortgage) is **not** treated as daily burn.
 * Only the smooth remainder is extrapolated; the front-load is a floor.
 *
 * ```
 * smoothSpent = max(0, spentToDate − frontLoaded)
 * monthEnd    = frontLoaded + smoothSpent × dayCount / daysElapsed
 * projected   = linear from today's Actual → monthEnd
 * ```
 *
 * When `frontLoaded` is 0 (Flexible filter), this collapses to classic
 * `spentToDate × day / daysElapsed`. When spend is still below the mortgage
 * floor, month-end lands on the floor (mortgage will post) instead of
 * inventing a burn rate from a tiny day-1 Actual.
 *
 * Null before today, before the month starts, or when the month is complete.
 */
export function projectedPaceAmount(params: {
  dayIndex: number;
  dayCount: number;
  /** 1-based days elapsed this month (today's date, clamped). */
  daysElapsed: number;
  spentToDate: number;
  /** Housing (or committed) amount recognized up front — not daily burn. */
  frontLoadedAmount?: number;
}): number | null {
  const { dayIndex, dayCount, daysElapsed, spentToDate } = params;
  if (dayCount <= 0 || dayIndex < 0 || dayIndex >= dayCount) return null;
  if (daysElapsed <= 0 || daysElapsed >= dayCount) return null;
  if (dayIndex < daysElapsed - 1) return null;

  const front = Math.max(0, params.frontLoadedAmount ?? 0);
  if (spentToDate <= 0 && front <= 0) return null;

  const spent = Math.max(0, spentToDate);
  const smoothSpent = Math.max(0, spent - front);
  const monthEnd = front + (smoothSpent * dayCount) / daysElapsed;

  // Meet Actual on today; linear to mortgage-aware month-end afterward.
  if (dayIndex === daysElapsed - 1) {
    return Math.round(spent * 100) / 100;
  }

  const remainingSpan = dayCount - daysElapsed;
  if (remainingSpan <= 0) return null;
  const daysAhead = dayIndex + 1 - daysElapsed;
  const value = spent + ((monthEnd - spent) * daysAhead) / remainingSpan;
  return Math.round(value * 100) / 100;
}

/**
 * Y-axis domain for Month pace. When `elevateFloor` is set (All-funds view),
 * start slightly below the mortgage front-load (Housing budget) so the chart
 * isn't half empty below the mortgage. Other filters keep a $0 baseline.
 *
 * Do **not** pull the floor down to early Actual values: mortgage often posts
 * day 2–few, so day-1 Actual can be a few hundred while Housing is ~$3k.
 * `allowDataOverflow` on the chart lets pre-mortgage points sit below the axis.
 */
export function spendPaceYDomain(params: {
  budgetTotal: number;
  ideals: number[];
  actuals: number[];
  /** Projected future points (may exceed budget). */
  projected?: number[];
  /** Front-loaded committed/reserve amount; only elevates when > 0 and elevateFloor. */
  frontLoadedAmount?: number;
  elevateFloor?: boolean;
}): [number, number] {
  const { budgetTotal, ideals, actuals } = params;
  const projected = params.projected ?? [];
  const seriesMax = Math.max(
    budgetTotal,
    ...ideals,
    ...actuals,
    ...projected,
    0,
  );
  const yMax = Math.max(seriesMax, 1);

  const front = Math.max(0, params.frontLoadedAmount ?? 0);
  if (!params.elevateFloor || front <= 0) {
    return [0, yMax];
  }

  const pad = Math.max(front * 0.04, 25);
  const yMin = Math.max(0, front - pad);
  if (yMin >= yMax) {
    return [0, yMax];
  }
  return [yMin, yMax];
}

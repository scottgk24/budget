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
 * Linear projected cumulative spend for day `dayIndex` (0-based), based on
 * average daily burn through `daysElapsed` (1-based today).
 *
 * ```
 * projected(day) = spentToDate × (dayIndex + 1) / daysElapsed
 * monthEnd       = spentToDate × dayCount / daysElapsed
 * ```
 *
 * Null before today (Actual owns the past), when the month hasn't started,
 * or when the month is already complete (nothing left to project).
 */
export function projectedPaceAmount(params: {
  dayIndex: number;
  dayCount: number;
  /** 1-based days elapsed this month (today's date, clamped). */
  daysElapsed: number;
  spentToDate: number;
}): number | null {
  const { dayIndex, dayCount, daysElapsed, spentToDate } = params;
  if (dayCount <= 0 || dayIndex < 0 || dayIndex >= dayCount) return null;
  if (daysElapsed <= 0 || daysElapsed >= dayCount) return null;
  if (dayIndex < daysElapsed - 1) return null;
  if (spentToDate <= 0) return null;
  return Math.round(((spentToDate * (dayIndex + 1)) / daysElapsed) * 100) / 100;
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

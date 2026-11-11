export type SpendPacePoint = {
  day: number;
  label: string;
  actual: number | null;
  ideal: number;
  /**
   * Linear projection from today's cumulative spend at the current average
   * daily burn. Null before today / when the month is complete.
   */
  projected: number | null;
  date: string;
};

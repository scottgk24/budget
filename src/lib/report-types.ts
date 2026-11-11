export type SpendPacePoint = {
  day: number;
  label: string;
  actual: number | null;
  ideal: number;
  /**
   * Mortgage-aware projection: Housing/front-load stays as a floor; only
   * smooth (non-Housing) spend is extrapolated from today. Null before today
   * / when the month is complete.
   */
  projected: number | null;
  date: string;
};

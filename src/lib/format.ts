import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfYear,
  startOfWeek,
  endOfWeek,
  subDays,
  subMonths,
} from "date-fns";

export type MetricsGranularity = "daily" | "weekly" | "monthly" | "yearly";

/** Lookback window for dashboard metrics charts. */
export type MetricsRangeId = "30d" | "3m" | "6m" | "12m" | "ytd" | "all";

export const METRICS_RANGES: Array<{ id: MetricsRangeId; label: string }> = [
  { id: "30d", label: "30 days" },
  { id: "3m", label: "3 months" },
  { id: "6m", label: "6 months" },
  { id: "12m", label: "12 months" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All time" },
];

export function parseMetricsRangeId(raw: string | null | undefined): MetricsRangeId {
  if (
    raw === "30d" ||
    raw === "3m" ||
    raw === "6m" ||
    raw === "12m" ||
    raw === "ytd" ||
    raw === "all"
  ) {
    return raw;
  }
  return "3m";
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Compact currency for chart axes (e.g. $1.2k). */
export function formatCompactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Plaid amounts: positive = money leaving the account (spend). */
export function formatSignedCurrency(amount: number, currency = "USD"): string {
  const abs = formatCurrency(Math.abs(amount), currency);
  if (amount > 0) return `-${abs}`;
  if (amount < 0) return `+${abs}`;
  return abs;
}

export function monthKey(date: Date = new Date()): string {
  return format(date, "yyyy-MM");
}

/** Calendar year key, e.g. "2026". */
export function yearKey(date: Date = new Date()): string {
  return format(date, "yyyy");
}

/** Year from a month key (`yyyy-MM`) or year key (`yyyy`). */
export function yearFromPeriod(period: string): string {
  return period.slice(0, 4);
}

export function yearRange(year: string): { start: Date; end: Date } {
  const start = startOfYear(parseISO(`${year}-01-01`));
  return { start, end: endOfYear(start) };
}

/** Monthly allotment for an annual budget amount. */
export function monthlyAllotment(annualAmount: number): number {
  return Math.round((annualAmount / 12) * 100) / 100;
}

/** Recent month keys newest-first, e.g. for filter dropdowns. */
export function recentMonthKeys(count = 12, now: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(subMonths(now, i)));
}

export function formatMonthLabel(month: string): string {
  return format(parseISO(`${month}-01`), "MMM yyyy");
}

export function monthRange(month: string): { start: Date; end: Date } {
  const start = startOfMonth(parseISO(`${month}-01`));
  const end = endOfMonth(start);
  return { start, end };
}

const WEEK_OPTS = { weekStartsOn: 1 as const };

/** Stable bucket key for a date at the given granularity. */
export function metricsBucketKey(date: Date, granularity: MetricsGranularity): string {
  if (granularity === "daily") return format(date, "yyyy-MM-dd");
  if (granularity === "weekly") {
    return format(startOfWeek(date, WEEK_OPTS), "yyyy-MM-dd");
  }
  if (granularity === "monthly") return format(date, "yyyy-MM");
  return format(date, "yyyy");
}

/** Start/end (inclusive) and display label for a chart bucket key. */
export function periodBounds(
  key: string,
  granularity: MetricsGranularity,
): { start: Date; end: Date; label: string } {
  if (granularity === "daily") {
    const start = startOfDay(parseISO(key));
    return {
      start,
      end: endOfDay(start),
      label: format(start, "MMM d, yyyy"),
    };
  }
  if (granularity === "weekly") {
    const start = startOfDay(parseISO(key));
    const end = endOfWeek(start, WEEK_OPTS);
    return {
      start,
      end,
      label: `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`,
    };
  }
  if (granularity === "monthly") {
    const { start, end } = monthRange(key);
    return { start, end, label: format(start, "MMM yyyy") };
  }
  const start = startOfYear(parseISO(`${key}-01-01`));
  return { start, end: endOfYear(start), label: key };
}

/**
 * Date range for metrics charts.
 * `earliestData` is used when range is `all` (first synced transaction).
 */
export function metricsRange(
  rangeId: MetricsRangeId,
  now: Date = new Date(),
  earliestData?: Date | null,
): { start: Date; end: Date } {
  const end = endOfDay(now);
  let start: Date;

  if (rangeId === "30d") {
    start = startOfDay(subDays(now, 29));
  } else if (rangeId === "3m") {
    start = startOfMonth(subMonths(now, 2));
  } else if (rangeId === "6m") {
    start = startOfMonth(subMonths(now, 5));
  } else if (rangeId === "12m") {
    start = startOfMonth(subMonths(now, 11));
  } else if (rangeId === "ytd") {
    start = startOfYear(now);
  } else {
    start = earliestData
      ? startOfDay(earliestData)
      : startOfMonth(subMonths(now, 11));
  }

  if (start > end) start = startOfDay(now);
  return { start, end };
}


export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

/** ISO date (yyyy-MM-dd) for API from/to params. */
export function toDateParam(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

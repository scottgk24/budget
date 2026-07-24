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
  subWeeks,
  subYears,
} from "date-fns";

export type MetricsGranularity = "daily" | "weekly" | "monthly" | "yearly";

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

/** Date range for metrics charts by granularity. */
export function metricsRange(
  granularity: MetricsGranularity,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const end = endOfDay(now);
  if (granularity === "daily") {
    return { start: startOfDay(subDays(now, 29)), end };
  }
  if (granularity === "weekly") {
    return {
      start: startOfWeek(subWeeks(now, 11), WEEK_OPTS),
      end,
    };
  }
  if (granularity === "monthly") {
    return { start: startOfMonth(subMonths(now, 11)), end };
  }
  return { start: startOfYear(subYears(now, 4)), end: endOfYear(now) };
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

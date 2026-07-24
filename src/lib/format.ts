import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  startOfYear,
  endOfYear,
  subDays,
  subMonths,
  subYears,
} from "date-fns";

export type MetricsGranularity = "daily" | "monthly" | "yearly";

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

export function monthRange(month: string): { start: Date; end: Date } {
  const start = startOfMonth(parseISO(`${month}-01`));
  const end = endOfMonth(start);
  return { start, end };
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
  if (granularity === "monthly") {
    return { start: startOfMonth(subMonths(now, 11)), end };
  }
  return { start: startOfYear(subYears(now, 4)), end: endOfYear(now) };
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

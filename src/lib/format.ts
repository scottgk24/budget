import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
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

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "MMM d, yyyy");
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

import { differenceInCalendarDays } from "date-fns";
import { merchantRuleKey } from "@/lib/categories";

export type RecurringCadence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export type TxForRecurring = {
  id: string;
  amount: number;
  date: Date;
  name: string;
  merchantName: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export type DetectedRecurring = {
  key: string;
  merchant: string;
  averageAmount: number;
  cadence: RecurringCadence;
  occurrenceCount: number;
  lastDate: string;
  nextDate: string;
  categoryName: string | null;
  categoryId: string | null;
  isSubscription: boolean;
  transactionIds: string[];
};

const SUBSCRIPTION_HINTS = [
  "netflix",
  "spotify",
  "hulu",
  "disney",
  "apple",
  "adobe",
  "github",
  "dropbox",
  "notion",
  "openai",
  "chatgpt",
  "amazon prime",
  "youtube",
  "icloud",
  "microsoft",
  "google one",
  "gym",
  "membership",
  "subscription",
];

function displayMerchant(tx: TxForRecurring): string {
  return (tx.merchantName || tx.name || "Unknown").trim();
}

function groupKey(tx: TxForRecurring): string {
  const raw = tx.merchantName || tx.name;
  const key = merchantRuleKey(raw);
  if (key) return key;
  return normalizeLoose(raw);
}

function normalizeLoose(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function classifyCadence(avgGapDays: number): RecurringCadence | null {
  if (avgGapDays >= 5 && avgGapDays <= 9) return "weekly";
  if (avgGapDays >= 11 && avgGapDays <= 18) return "biweekly";
  if (avgGapDays >= 25 && avgGapDays <= 35) return "monthly";
  if (avgGapDays >= 80 && avgGapDays <= 100) return "quarterly";
  if (avgGapDays >= 340 && avgGapDays <= 390) return "yearly";
  return null;
}

function cadenceDays(cadence: RecurringCadence): number {
  switch (cadence) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 30;
    case "quarterly":
      return 91;
    case "yearly":
      return 365;
  }
}

function amountsSimilar(a: number, b: number): boolean {
  const avg = (Math.abs(a) + Math.abs(b)) / 2;
  if (avg === 0) return true;
  return Math.abs(Math.abs(a) - Math.abs(b)) / avg <= 0.12;
}

function isSubscriptionLike(merchant: string, categoryName: string | null): boolean {
  const hay = `${merchant} ${categoryName ?? ""}`.toLowerCase();
  if (categoryName === "Subscriptions" || categoryName === "Software") return true;
  return SUBSCRIPTION_HINTS.some((h) => hay.includes(h));
}

function nextOccurrence(last: Date, cadence: RecurringCadence): Date {
  const days = cadenceDays(cadence);
  const next = new Date(last);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Heuristic recurring detection from spend transactions.
 * Groups by normalized merchant, requires ≥3 similar-amount charges with a
 * recognizable cadence (weekly → yearly).
 */
export function detectRecurring(transactions: TxForRecurring[]): DetectedRecurring[] {
  const spend = transactions.filter((tx) => tx.amount > 0);
  const groups = new Map<string, TxForRecurring[]>();

  for (const tx of spend) {
    const key = groupKey(tx);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(tx);
    groups.set(key, list);
  }

  const results: DetectedRecurring[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < 3) continue;

    const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime());
    const amounts = sorted.map((t) => t.amount);
    const med = median(amounts);
    const similar = sorted.filter((t) => amountsSimilar(t.amount, med));
    if (similar.length < 3) continue;

    const gaps: number[] = [];
    for (let i = 1; i < similar.length; i++) {
      gaps.push(differenceInCalendarDays(similar[i].date, similar[i - 1].date));
    }
    const avgGap = mean(gaps);
    const cadence = classifyCadence(avgGap);
    if (!cadence) continue;

    // Gaps should be reasonably consistent
    const gapTolerance = cadence === "monthly" ? 8 : cadenceDays(cadence) * 0.35;
    const consistentGaps = gaps.filter((g) => Math.abs(g - avgGap) <= gapTolerance);
    if (consistentGaps.length < gaps.length - 1 && gaps.length >= 2) {
      if (consistentGaps.length < Math.ceil(gaps.length * 0.6)) continue;
    }

    const last = similar[similar.length - 1];
    const merchant = displayMerchant(last);
    const categoryName =
      similar.map((t) => t.categoryName).find(Boolean) ?? null;
    const categoryId =
      similar.map((t) => t.categoryId).find(Boolean) ?? null;
    const next = nextOccurrence(last.date, cadence);

    results.push({
      key,
      merchant,
      averageAmount: Math.round(mean(similar.map((t) => t.amount)) * 100) / 100,
      cadence,
      occurrenceCount: similar.length,
      lastDate: last.date.toISOString(),
      nextDate: next.toISOString(),
      categoryName,
      categoryId,
      isSubscription: isSubscriptionLike(merchant, categoryName),
      transactionIds: similar.map((t) => t.id),
    });
  }

  return results.sort((a, b) => b.averageAmount - a.averageAmount);
}

export function upcomingRecurringTotal(
  items: DetectedRecurring[],
  through: Date,
  from: Date = new Date(),
): number {
  let total = 0;
  for (const item of items) {
    const next = new Date(item.nextDate);
    if (next >= from && next <= through) {
      total += item.averageAmount;
    }
  }
  return Math.round(total * 100) / 100;
}

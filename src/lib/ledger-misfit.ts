import type { LedgerKind } from "@/lib/types";

const BUSINESS_CATEGORIES = new Set([
  "Supplies",
  "Software",
  "Marketing",
  "Contractors",
  "Office",
  "Meals",
]);

const PERSONAL_CATEGORIES = new Set([
  "Groceries",
  "Dining",
  "Housing",
  "Pets",
  "Subscriptions",
  "Entertainment",
  "Shopping",
  "Healthcare",
  "Home Improvement",
]);

const BUSINESS_MERCHANT =
  /\b(aws|google ads|adwords|quickbooks|wework|staples|office depot|upwork|fiverr|godaddy|namecheap|linkedin ads|meta ads|github|vercel|slack|hubspot|salesforce)\b/i;

const PERSONAL_MERCHANT =
  /\b(netflix|hulu|spotify|disney\+|whole foods|trader joe|kroger|costco|target|daycare|equinox|peloton|doordash|uber eats)\b/i;

export type LedgerMisfit = {
  suggestedKind: LedgerKind;
  reason: string;
};

export function detectLedgerMisfit(opts: {
  currentKind: LedgerKind;
  categoryName: string | null | undefined;
  merchantName: string | null | undefined;
  name: string;
}): LedgerMisfit | null {
  const text = `${opts.merchantName ?? ""} ${opts.name}`;
  const category = opts.categoryName ?? "";

  if (opts.currentKind === "personal") {
    if (BUSINESS_CATEGORIES.has(category) || BUSINESS_MERCHANT.test(text)) {
      return {
        suggestedKind: "business",
        reason: "Looks like a business expense on a personal ledger",
      };
    }
    return null;
  }

  if (PERSONAL_CATEGORIES.has(category) || PERSONAL_MERCHANT.test(text)) {
    return {
      suggestedKind: "personal",
      reason: "Looks like a personal expense on a business ledger",
    };
  }
  return null;
}

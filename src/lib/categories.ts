import type { Ledger } from "@/lib/types";

export const PERSONAL_CATEGORIES = [
  "Groceries",
  "Dining",
  "Housing",
  "Utilities",
  "Transport",
  "Healthcare",
  "Entertainment",
  "Shopping",
  "Subscriptions",
  "Travel",
  "Income",
  "Transfers",
  "Other",
] as const;

export const BUSINESS_CATEGORIES = [
  "Supplies",
  "Software",
  "Marketing",
  "Contractors",
  "Travel",
  "Meals",
  "Office",
  "Insurance",
  "Taxes",
  "Income",
  "Transfers",
  "Other",
] as const;

/** Map common Plaid personal finance category strings to our category names. */
const PLAID_MAP: Record<string, string> = {
  FOOD_AND_DRINK: "Dining",
  GROCERIES: "Groceries",
  RENT_AND_UTILITIES: "Housing",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  ENTERTAINMENT: "Entertainment",
  GENERAL_MERCHANDISE: "Shopping",
  MEDICAL: "Healthcare",
  PERSONAL_CARE: "Healthcare",
  TRANSFER_IN: "Transfers",
  TRANSFER_OUT: "Transfers",
  INCOME: "Income",
  LOAN_PAYMENTS: "Other",
  BANK_FEES: "Other",
  GENERAL_SERVICES: "Other",
};

export function mapPlaidCategory(
  plaidPrimary: string | null | undefined,
  ledger: Ledger,
): string {
  if (!plaidPrimary) return "Other";
  const mapped = PLAID_MAP[plaidPrimary.toUpperCase()];
  if (mapped) {
    if (ledger === "business") {
      if (mapped === "Dining") return "Meals";
      if (mapped === "Shopping") return "Supplies";
      if (mapped === "Housing") return "Office";
      if (mapped === "Entertainment") return "Marketing";
    }
    return mapped;
  }
  return "Other";
}

export function defaultCategoriesForLedger(ledger: Ledger): readonly string[] {
  return ledger === "personal" ? PERSONAL_CATEGORIES : BUSINESS_CATEGORIES;
}

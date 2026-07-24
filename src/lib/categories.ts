import type { Ledger } from "@/lib/types";
import type { Prisma } from "@prisma/client";

/**
 * Account-to-account moves: bank transfers and credit-card payments.
 * Plaid tags CC payments as LOAN_PAYMENTS even when no loan account is linked.
 */
export const TRANSFER_CATEGORY = "Transfers";

/** Positive amounts here are not consumption (and Income is never spend). */
export const NON_SPEND_CATEGORIES = [TRANSFER_CATEGORY, "Income"] as const;

export const excludeTransfersCategory: Prisma.TransactionWhereInput = {
  NOT: { category: { name: TRANSFER_CATEGORY } },
};

export const excludeNonSpendCategory: Prisma.TransactionWhereInput = {
  NOT: { category: { name: { in: [...NON_SPEND_CATEGORIES] } } },
};

export function isSpendAmount(
  amount: number,
  categoryName: string | null | undefined,
): boolean {
  if (amount <= 0) return false;
  if (categoryName && (NON_SPEND_CATEGORIES as readonly string[]).includes(categoryName)) {
    return false;
  }
  return true;
}

export function isIncomeAmount(
  amount: number,
  categoryName: string | null | undefined,
): boolean {
  if (amount >= 0) return false;
  // Transfer inflows are not income; paychecks under Income still count.
  if (categoryName === TRANSFER_CATEGORY) return false;
  return true;
}

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

export type CategorySource = "plaid" | "rule" | "user";

/** Normalize merchant / name for rule matching. */
export function normalizeMatchValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function businessRemap(name: string, ledger: Ledger): string {
  if (ledger !== "business") return name;
  if (name === "Dining") return "Meals";
  if (name === "Shopping") return "Supplies";
  if (name === "Housing") return "Office";
  if (name === "Entertainment") return "Marketing";
  if (name === "Subscriptions") return "Software";
  if (name === "Utilities") return "Office";
  if (name === "Groceries") return "Supplies";
  if (name === "Healthcare") return "Insurance";
  if (name === "Transport") return "Travel";
  return name;
}

/** Plaid detailed PFC → our category (personal names). */
const DETAILED_MAP: Record<string, string> = {
  // Food
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_RESTAURANT: "Dining",
  FOOD_AND_DRINK_FAST_FOOD: "Dining",
  FOOD_AND_DRINK_COFFEE: "Dining",
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: "Dining",
  FOOD_AND_DRINK_VENDING_MACHINES: "Dining",
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: "Dining",

  // Housing / utilities
  RENT_AND_UTILITIES_RENT: "Housing",
  RENT_AND_UTILITIES_MORTGAGE: "Housing",
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Utilities",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Utilities",
  RENT_AND_UTILITIES_TELEPHONE: "Utilities",
  RENT_AND_UTILITIES_WATER: "Utilities",
  RENT_AND_UTILITIES_SEWER_AND_WASTE_MANAGEMENT: "Utilities",
  RENT_AND_UTILITIES_OTHER_UTILITIES: "Utilities",

  // Transport
  TRANSPORTATION_GAS: "Transport",
  TRANSPORTATION_PARKING: "Transport",
  TRANSPORTATION_PUBLIC_TRANSIT: "Transport",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Transport",
  TRANSPORTATION_TOLLS: "Transport",
  TRANSPORTATION_BIKES_AND_SCOOTERS: "Transport",
  TRANSPORTATION_OTHER_TRANSPORTATION: "Transport",

  // Travel
  TRAVEL_FLIGHTS: "Travel",
  TRAVEL_LODGING: "Travel",
  TRAVEL_RENTAL_CARS: "Travel",
  TRAVEL_OTHER_TRAVEL: "Travel",

  // Entertainment / subscriptions
  ENTERTAINMENT_TV_AND_MOVIES: "Subscriptions",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "Subscriptions",
  ENTERTAINMENT_VIDEO_GAMES: "Entertainment",
  ENTERTAINMENT_CASINOS_AND_GAMBLING: "Entertainment",
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: "Entertainment",
  ENTERTAINMENT_OTHER_ENTERTAINMENT: "Entertainment",

  // Merchandise
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "Shopping",
  GENERAL_MERCHANDISE_ELECTRONICS: "Shopping",
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: "Shopping",
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: "Shopping",
  GENERAL_MERCHANDISE_DEPARTMENT_STORES: "Shopping",
  GENERAL_MERCHANDISE_DISCOUNT_STORES: "Shopping",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "Shopping",
  GENERAL_MERCHANDISE_PET_SUPPLIES: "Shopping",
  GENERAL_MERCHANDISE_SPORTING_GOODS: "Shopping",
  GENERAL_MERCHANDISE_SUPERSTORES: "Shopping",
  GENERAL_MERCHANDISE_TOBACCO_AND_VAPE: "Shopping",
  GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE: "Shopping",

  // Home
  HOME_IMPROVEMENT_FURNITURE: "Shopping",
  HOME_IMPROVEMENT_HARDWARE: "Shopping",
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: "Housing",
  HOME_IMPROVEMENT_SECURITY: "Housing",
  HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: "Shopping",

  // Medical / care
  MEDICAL_DENTAL_CARE: "Healthcare",
  MEDICAL_EYE_CARE: "Healthcare",
  MEDICAL_NURSING_CARE: "Healthcare",
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: "Healthcare",
  MEDICAL_PRIMARY_CARE: "Healthcare",
  MEDICAL_VETERINARY_SERVICES: "Healthcare",
  MEDICAL_OTHER_MEDICAL: "Healthcare",
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: "Healthcare",
  PERSONAL_CARE_HAIR_AND_BEAUTY: "Healthcare",
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: "Shopping",
  PERSONAL_CARE_OTHER_PERSONAL_CARE: "Healthcare",

  // Services — the big "Other" source
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: "Other",
  GENERAL_SERVICES_AUTOMOTIVE: "Transport",
  GENERAL_SERVICES_CHILDCARE: "Other",
  GENERAL_SERVICES_CONSULTING_AND_LEGAL: "Other",
  GENERAL_SERVICES_EDUCATION: "Other",
  GENERAL_SERVICES_INSURANCE: "Healthcare",
  GENERAL_SERVICES_POSTAGE_AND_SHIPPING: "Shopping",
  GENERAL_SERVICES_STORAGE: "Housing",
  GENERAL_SERVICES_OTHER_GENERAL_SERVICES: "Other",
  // Common subscription-ish detailed labels across taxonomy versions
  GENERAL_SERVICES_SUBSCRIPTION: "Subscriptions",
  GENERAL_SERVICES_OTHER_SUBSCRIPTION: "Subscriptions",

  // Gov / fees
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "Other",
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: "Other",
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: "Other",
  GOVERNMENT_AND_NON_PROFIT_OTHER_GOVERNMENT_AND_NON_PROFIT: "Other",
  BANK_FEES_ATM_FEES: "Other",
  BANK_FEES_FOREIGN_TRANSACTION_FEES: "Other",
  BANK_FEES_INSUFFICIENT_FUNDS: "Other",
  BANK_FEES_INTEREST_CHARGE: "Other",
  BANK_FEES_OVERDRAFT_FEES: "Other",
  BANK_FEES_OTHER_BANK_FEES: "Other",

  // Income / transfers / loans
  INCOME_DIVIDENDS: "Income",
  INCOME_INTEREST_EARNED: "Income",
  INCOME_RETIREMENT_PENSION: "Income",
  INCOME_TAX_REFUND: "Income",
  INCOME_UNEMPLOYMENT: "Income",
  INCOME_WAGES: "Income",
  INCOME_OTHER_INCOME: "Income",
  TRANSFER_IN_ACCOUNT_TRANSFER: "Transfers",
  TRANSFER_IN_DEPOSIT: "Transfers",
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfers",
  TRANSFER_IN_SAVINGS: "Transfers",
  TRANSFER_IN_OTHER_TRANSFER_IN: "Transfers",
  TRANSFER_OUT_ACCOUNT_TRANSFER: "Transfers",
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: "Transfers",
  TRANSFER_OUT_SAVINGS: "Transfers",
  TRANSFER_OUT_WITHDRAWAL: "Transfers",
  TRANSFER_OUT_OTHER_TRANSFER_OUT: "Transfers",
  LOAN_PAYMENTS_CAR_PAYMENT: "Transfers",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "Transfers",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "Transfers",
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: "Transfers",
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: "Transfers",
  LOAN_PAYMENTS_OTHER_PAYMENT: "Transfers",
};

/** Plaid primary PFC → our category (personal names). */
const PRIMARY_MAP: Record<string, string> = {
  FOOD_AND_DRINK: "Dining",
  GROCERIES: "Groceries",
  RENT_AND_UTILITIES: "Housing",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  ENTERTAINMENT: "Entertainment",
  GENERAL_MERCHANDISE: "Shopping",
  HOME_IMPROVEMENT: "Shopping",
  MEDICAL: "Healthcare",
  PERSONAL_CARE: "Healthcare",
  GENERAL_SERVICES: "Other",
  GOVERNMENT_AND_NON_PROFIT: "Other",
  BANK_FEES: "Other",
  TRANSFER_IN: "Transfers",
  TRANSFER_OUT: "Transfers",
  INCOME: "Income",
  LOAN_PAYMENTS: "Transfers",
};

/**
 * Map Plaid primary + detailed category to a Budget category name.
 * Detailed wins when present.
 */
export function mapPlaidCategory(
  plaidPrimary: string | null | undefined,
  ledger: Ledger,
  plaidDetailed?: string | null,
): string {
  const detailed = plaidDetailed?.toUpperCase() ?? null;
  if (detailed && DETAILED_MAP[detailed]) {
    return businessRemap(DETAILED_MAP[detailed], ledger);
  }

  if (!plaidPrimary) return "Other";
  const primary = plaidPrimary.toUpperCase();
  const mapped = PRIMARY_MAP[primary];
  if (mapped) return businessRemap(mapped, ledger);
  return "Other";
}

export function defaultCategoriesForLedger(ledger: Ledger): readonly string[] {
  return ledger === "personal" ? PERSONAL_CATEGORIES : BUSINESS_CATEGORIES;
}

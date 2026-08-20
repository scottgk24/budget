import { subDays } from "date-fns";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { monthKey, yearKey } from "@/lib/format";

export const DEMO_COOKIE = "sage-demo";
export const DEMO_COOKIE_VALUE = "1";
export const DEMO_CLERK_ID = "demo_sage_system";
export const DEMO_EMAIL = "demo@sage.local";
export const DEMO_USER_NAME = "Demo Visitor";
export const DEMO_WORKSPACE_NAME = "Demo Household";

/** Reseed shared demo data if older than this. */
const DEMO_REFRESH_MS = 6 * 60 * 60 * 1000;

export async function isDemoRequest(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(DEMO_COOKIE)?.value === DEMO_COOKIE_VALUE;
}

export function demoCookieOptions(maxAgeSeconds = 60 * 60 * 12) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

type SeedTx = {
  accountKey: string;
  daysAgo: number;
  amount: number;
  name: string;
  merchantName?: string | null;
  categoryName?: string | null;
  categorySource?: string | null;
  pending?: boolean;
  ledger: "personal" | "business";
};

/** Four (or `count`) monthly charges ending at `latestDaysAgo`. */
function monthlyCharges(
  base: Omit<SeedTx, "daysAgo">,
  latestDaysAgo: number,
  count = 4,
): SeedTx[] {
  return Array.from({ length: count }, (_, i) => ({
    ...base,
    daysAgo: latestDaysAgo + i * 30,
  }));
}

function buildSeedTransactions(): SeedTx[] {
  return [
    // Personal — current month
    {
      accountKey: "chase-checking",
      daysAgo: 1,
      amount: 84.32,
      name: "WHOLE FOODS MARKET",
      merchantName: "Whole Foods",
      categoryName: "Groceries",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 2,
      amount: 62.4,
      name: "TST* OLIVE & OAK",
      merchantName: "Olive & Oak",
      categoryName: "Dining",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 3,
      amount: 14.99,
      name: "NETFLIX.COM",
      merchantName: "Netflix",
      categoryName: "Subscriptions",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 33,
      amount: 14.99,
      name: "NETFLIX.COM",
      merchantName: "Netflix",
      categoryName: "Subscriptions",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 63,
      amount: 14.99,
      name: "NETFLIX.COM",
      merchantName: "Netflix",
      categoryName: "Subscriptions",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 93,
      amount: 14.99,
      name: "NETFLIX.COM",
      merchantName: "Netflix",
      categoryName: "Subscriptions",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 5,
      amount: 10.99,
      name: "SPOTIFY USA",
      merchantName: "Spotify",
      categoryName: "Subscriptions",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 35,
      amount: 10.99,
      name: "SPOTIFY USA",
      merchantName: "Spotify",
      categoryName: "Subscriptions",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 65,
      amount: 10.99,
      name: "SPOTIFY USA",
      merchantName: "Spotify",
      categoryName: "Subscriptions",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 6,
      amount: 2200,
      name: "ACH RENT PAYMENT",
      merchantName: "Horizon Property",
      categoryName: "Housing",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 36,
      amount: 2200,
      name: "ACH RENT PAYMENT",
      merchantName: "Horizon Property",
      categoryName: "Housing",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 66,
      amount: 2200,
      name: "ACH RENT PAYMENT",
      merchantName: "Horizon Property",
      categoryName: "Housing",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 96,
      amount: 2200,
      name: "ACH RENT PAYMENT",
      merchantName: "Horizon Property",
      categoryName: "Housing",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 8,
      amount: 12.5,
      name: "STARBUCKS STORE 1142",
      merchantName: "Starbucks",
      categoryName: "Dining",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 15,
      amount: 9.75,
      name: "STARBUCKS STORE 882",
      merchantName: "Starbucks",
      categoryName: "Dining",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 22,
      amount: 11.2,
      name: "STARBUCKS STORE 1142",
      merchantName: "Starbucks",
      categoryName: "Dining",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 40,
      amount: 8.4,
      name: "STARBUCKS STORE 201",
      merchantName: "Starbucks",
      categoryName: "Dining",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 48,
      amount: 14.1,
      name: "STARBUCKS STORE 1142",
      merchantName: "Starbucks",
      categoryName: "Dining",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 58,
      amount: 7.95,
      name: "STARBUCKS STORE 99",
      merchantName: "Starbucks",
      categoryName: "Dining",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 4,
      amount: 48.2,
      name: "SHELL OIL 5748291",
      merchantName: "Shell",
      categoryName: "Transport",
      categorySource: "plaid",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 11,
      amount: 129.0,
      name: "NORDSTROM #452",
      merchantName: "Nordstrom",
      categoryName: null,
      categorySource: null,
      ledger: "personal",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 3,
      amount: 79,
      name: "ADOBE CREATIVE CLOUD",
      merchantName: "Adobe",
      categoryName: "Software",
      categorySource: "rule",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 33,
      amount: 79,
      name: "ADOBE CREATIVE CLOUD",
      merchantName: "Adobe",
      categoryName: "Software",
      categorySource: "rule",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 63,
      amount: 79,
      name: "ADOBE CREATIVE CLOUD",
      merchantName: "Adobe",
      categoryName: "Software",
      categorySource: "rule",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 93,
      amount: 79,
      name: "ADOBE CREATIVE CLOUD",
      merchantName: "Adobe",
      categoryName: "Software",
      categorySource: "rule",
      ledger: "business",
    },
    // Prior months for charts — more grocery/dining volume
    {
      accountKey: "amex",
      daysAgo: 28,
      amount: 186.4,
      name: "WHOLE FOODS MARKET",
      merchantName: "Whole Foods",
      categoryName: "Groceries",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 50,
      amount: 95.2,
      name: "OLIVE GARDEN",
      merchantName: "Olive Garden",
      categoryName: "Dining",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 80,
      amount: 72.5,
      name: "CHIPOTLE 1842",
      merchantName: "Chipotle",
      categoryName: "Dining",
      categorySource: "plaid",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 15,
      amount: 144.8,
      name: "PG&E UTILITY",
      merchantName: "PG&E",
      categoryName: "Utilities",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 45,
      amount: 142.55,
      name: "PG&E UTILITY",
      merchantName: "PG&E",
      categoryName: "Utilities",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 75,
      amount: 138.2,
      name: "PG&E UTILITY",
      merchantName: "PG&E",
      categoryName: "Utilities",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 105,
      amount: 151.0,
      name: "PG&E UTILITY",
      merchantName: "PG&E",
      categoryName: "Utilities",
      categorySource: "rule",
      ledger: "personal",
    },
    ...monthlyCharges(
      {
        accountKey: "chase-checking",
        amount: 89.99,
        name: "XFINITY INTERNET",
        merchantName: "Xfinity",
        categoryName: "Utilities",
        categorySource: "rule",
        ledger: "personal",
      },
      27,
    ),
    ...monthlyCharges(
      {
        accountKey: "amex",
        amount: 24.99,
        name: "PLANET FITNESS",
        merchantName: "Planet Fitness",
        categoryName: "Subscriptions",
        categorySource: "rule",
        ledger: "personal",
      },
      16,
    ),
    {
      accountKey: "amex",
      daysAgo: 8,
      amount: 67.8,
      name: "CVS/PHARMACY #1182",
      merchantName: "CVS",
      categoryName: "Healthcare",
      categorySource: "plaid",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 9,
      amount: 42.0,
      name: "UNKNOWN MERCHANT POS",
      merchantName: null,
      categoryName: "Other",
      categorySource: "plaid",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 10,
      amount: 89.5,
      name: "PETCO #291",
      merchantName: "Petco",
      categoryName: "Pets",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 12,
      amount: 35.0,
      name: "AMC THEATRES",
      merchantName: "AMC",
      categoryName: "Entertainment",
      categorySource: "plaid",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 14,
      amount: -6200,
      name: "DIRECT DEP ACME CORP",
      merchantName: "Acme Corp",
      categoryName: "Income",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 15,
      amount: 500,
      name: "TRANSFER TO SAVINGS",
      merchantName: "Chase",
      categoryName: "Transfers",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 16,
      amount: 210.4,
      name: "HOME DEPOT #4831",
      merchantName: "Home Depot",
      categoryName: "Home Improvement",
      categorySource: "plaid",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 18,
      amount: 55.0,
      name: "NEEDS MANUAL REVIEW",
      merchantName: "Mystery Co",
      categoryName: "Review",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 20,
      amount: 312.0,
      name: "DELTA AIR LINES",
      merchantName: "Delta",
      categoryName: "Travel",
      categorySource: "plaid",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 22,
      amount: 75.0,
      name: "BIRTHDAY GIFT AMAZON",
      merchantName: "Amazon",
      categoryName: "Gifts",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 0,
      amount: 28.5,
      name: "STARBUCKS STORE 1142",
      merchantName: "Starbucks",
      categoryName: "Dining",
      categorySource: "rule",
      pending: true,
      ledger: "personal",
    },
    // Prior months for charts
    {
      accountKey: "chase-checking",
      daysAgo: 35,
      amount: -6200,
      name: "DIRECT DEP ACME CORP",
      merchantName: "Acme Corp",
      categoryName: "Income",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 42,
      amount: 410.2,
      name: "TRADER JOE'S",
      merchantName: "Trader Joe's",
      categoryName: "Groceries",
      categorySource: "rule",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 55,
      amount: 188.4,
      name: "DINING OUT MIX",
      merchantName: "Local Bistro",
      categoryName: "Dining",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 65,
      amount: -6200,
      name: "DIRECT DEP ACME CORP",
      merchantName: "Acme Corp",
      categoryName: "Income",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 70,
      amount: 520,
      name: "STATE FARM INS",
      merchantName: "State Farm",
      categoryName: "Insurance",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "chase-checking",
      daysAgo: 95,
      amount: -6200,
      name: "DIRECT DEP ACME CORP",
      merchantName: "Acme Corp",
      categoryName: "Income",
      categorySource: "user",
      ledger: "personal",
    },
    {
      accountKey: "amex",
      daysAgo: 100,
      amount: 890,
      name: "AIRBNB STAY",
      merchantName: "Airbnb",
      categoryName: "Travel",
      categorySource: "plaid",
      ledger: "personal",
    },
    // Business
    {
      accountKey: "biz-checking",
      daysAgo: 2,
      amount: -4500,
      name: "CLIENT PAYMENT INVOICE 1842",
      merchantName: "Northwind LLC",
      categoryName: "Income",
      categorySource: "user",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 5,
      amount: 240,
      name: "STAPLES BUSINESS",
      merchantName: "Staples",
      categoryName: "Supplies",
      categorySource: "plaid",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 7,
      amount: 1200,
      name: "CONTRACTOR PAY J SMITH",
      merchantName: "Jordan Smith",
      categoryName: "Contractors",
      categorySource: "user",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 9,
      amount: 350,
      name: "GOOGLE ADS",
      merchantName: "Google Ads",
      categoryName: "Marketing",
      categorySource: "rule",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 11,
      amount: 64.2,
      name: "LUNCH WITH CLIENT",
      merchantName: "Cafe Luna",
      categoryName: "Meals",
      categorySource: "user",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 13,
      amount: 45,
      name: "WEWORK DAY PASS",
      merchantName: "WeWork",
      categoryName: "Office",
      categorySource: "plaid",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 15,
      amount: 88,
      name: "MISC VENDOR CHARGE",
      merchantName: null,
      categoryName: "Other",
      categorySource: "plaid",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 18,
      amount: 125,
      name: "FLAG FOR REVIEW",
      merchantName: "Unknown Vendor",
      categoryName: "Review",
      categorySource: "user",
      ledger: "business",
    },
    {
      accountKey: "biz-checking",
      daysAgo: 40,
      amount: -4200,
      name: "CLIENT PAYMENT INVOICE 1801",
      merchantName: "Northwind LLC",
      categoryName: "Income",
      categorySource: "user",
      ledger: "business",
    },
    ...monthlyCharges(
      {
        accountKey: "biz-checking",
        amount: 99,
        name: "GITHUB TEAM",
        merchantName: "GitHub",
        categoryName: "Software",
        categorySource: "rule",
        ledger: "business",
      },
      15,
    ),
    {
      accountKey: "biz-checking",
      daysAgo: 72,
      amount: -3800,
      name: "CLIENT PAYMENT INVOICE 1755",
      merchantName: "Contoso Inc",
      categoryName: "Income",
      categorySource: "user",
      ledger: "business",
    },
  ];
}

const PERSONAL_BUDGETS: Record<string, number> = {
  Groceries: 650,
  Dining: 350,
  Housing: 2200,
  Utilities: 250,
  "Home Improvement": 150,
  Transport: 220,
  Healthcare: 120,
  Pets: 80,
  Entertainment: 100,
  Shopping: 200,
  Subscriptions: 80,
};

const PERSONAL_ANNUAL_BUDGETS: Record<string, number> = {
  Travel: 4000,
  Insurance: 2400,
  Gifts: 800,
};

const BUSINESS_BUDGETS: Record<string, number> = {
  Supplies: 200,
  Software: 250,
  Marketing: 500,
  Contractors: 2000,
  Meals: 150,
  Office: 100,
};

const BUSINESS_ANNUAL_BUDGETS: Record<string, number> = {
  Travel: 3000,
  Insurance: 1800,
  Taxes: 6000,
};

async function wipeDemoWorkspace(workspaceId: string) {
  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { workspaceId } }),
    prisma.holding.deleteMany({ where: { workspaceId } }),
    prisma.budget.deleteMany({ where: { workspaceId } }),
    prisma.goal.deleteMany({ where: { workspaceId } }),
    prisma.categoryRule.deleteMany({ where: { workspaceId } }),
    prisma.account.deleteMany({ where: { workspaceId } }),
    prisma.plaidItem.deleteMany({ where: { workspaceId } }),
    prisma.category.deleteMany({ where: { workspaceId } }),
  ]);
}

async function populateDemoData(workspaceId: string) {
  // Dynamic import avoids a circular dependency with auth.ts.
  const { seedDefaultCategories } = await import("@/lib/auth");
  await seedDefaultCategories(workspaceId);

  const personalItem = await prisma.plaidItem.create({
    data: {
      workspaceId,
      itemId: `demo-item-personal-${workspaceId.slice(-8)}`,
      accessTokenEnc: "demo:not-encrypted",
      institutionId: "ins_demo_chase",
      institutionName: "Chase",
      products: "transactions,investments",
      defaultLedger: "personal",
      status: "active",
      lastSyncedAt: subDays(new Date(), 1),
    },
  });

  const businessItem = await prisma.plaidItem.create({
    data: {
      workspaceId,
      itemId: `demo-item-business-${workspaceId.slice(-8)}`,
      accessTokenEnc: "demo:not-encrypted",
      institutionId: "ins_demo_mercury",
      institutionName: "Mercury",
      products: "transactions",
      defaultLedger: "business",
      status: "active",
      lastSyncedAt: subDays(new Date(), 1),
    },
  });

  const chaseChecking = await prisma.account.create({
    data: {
      workspaceId,
      plaidItemId: personalItem.id,
      plaidAccountId: `demo-acct-checking-${workspaceId.slice(-8)}`,
      name: "Total Checking",
      officialName: "Chase Total Checking",
      mask: "4521",
      type: "depository",
      subtype: "checking",
      ledger: "personal",
      currentBalance: 6842.15,
      availableBalance: 6520.4,
    },
  });

  const chaseSavings = await prisma.account.create({
    data: {
      workspaceId,
      plaidItemId: personalItem.id,
      plaidAccountId: `demo-acct-savings-${workspaceId.slice(-8)}`,
      name: "Savings",
      officialName: "Chase Savings",
      mask: "8890",
      type: "depository",
      subtype: "savings",
      ledger: "personal",
      currentBalance: 18450.0,
      availableBalance: 18450.0,
    },
  });

  const amex = await prisma.account.create({
    data: {
      workspaceId,
      plaidItemId: personalItem.id,
      plaidAccountId: `demo-acct-amex-${workspaceId.slice(-8)}`,
      name: "Gold Card",
      officialName: "American Express Gold",
      mask: "1005",
      type: "credit",
      subtype: "credit card",
      ledger: "personal",
      currentBalance: 1240.55,
      availableBalance: 8759.45,
    },
  });

  const brokerage = await prisma.account.create({
    data: {
      workspaceId,
      plaidItemId: personalItem.id,
      plaidAccountId: `demo-acct-brokerage-${workspaceId.slice(-8)}`,
      name: "Brokerage",
      officialName: "Fidelity Brokerage",
      mask: "3312",
      type: "investment",
      subtype: "brokerage",
      ledger: "personal",
      currentBalance: 42890.2,
    },
  });

  const bizChecking = await prisma.account.create({
    data: {
      workspaceId,
      plaidItemId: businessItem.id,
      plaidAccountId: `demo-acct-biz-${workspaceId.slice(-8)}`,
      name: "Business Checking",
      officialName: "Mercury Checking",
      mask: "7744",
      type: "depository",
      subtype: "checking",
      ledger: "business",
      currentBalance: 15220.8,
      availableBalance: 15220.8,
    },
  });

  const accountByKey: Record<string, string> = {
    "chase-checking": chaseChecking.id,
    "chase-savings": chaseSavings.id,
    amex: amex.id,
    brokerage: brokerage.id,
    "biz-checking": bizChecking.id,
  };

  await prisma.holding.createMany({
    data: [
      {
        workspaceId,
        accountId: brokerage.id,
        symbol: "VTI",
        name: "Vanguard Total Stock Market ETF",
        quantity: 42.5,
        price: 268.4,
        value: 11407,
        costBasis: 9800,
        asOf: new Date(),
      },
      {
        workspaceId,
        accountId: brokerage.id,
        symbol: "VXUS",
        name: "Vanguard Total International Stock ETF",
        quantity: 85,
        price: 62.1,
        value: 5278.5,
        costBasis: 4900,
        asOf: new Date(),
      },
      {
        workspaceId,
        accountId: brokerage.id,
        symbol: "BND",
        name: "Vanguard Total Bond Market ETF",
        quantity: 120,
        price: 72.3,
        value: 8676,
        costBasis: 8400,
        asOf: new Date(),
      },
    ],
  });

  const categories = await prisma.category.findMany({ where: { workspaceId } });
  const catId = (ledger: string, name: string) =>
    categories.find((c) => c.ledger === ledger && c.name === name)?.id;

  const month = monthKey();
  const year = yearKey();

  const budgetRows: Array<{
    workspaceId: string;
    categoryId: string;
    ledger: string;
    month: string;
    amount: number;
  }> = [];

  for (const [name, amount] of Object.entries(PERSONAL_BUDGETS)) {
    const id = catId("personal", name);
    if (id) {
      budgetRows.push({
        workspaceId,
        categoryId: id,
        ledger: "personal",
        month,
        amount,
      });
    }
  }
  for (const [name, amount] of Object.entries(PERSONAL_ANNUAL_BUDGETS)) {
    const id = catId("personal", name);
    if (id) {
      budgetRows.push({
        workspaceId,
        categoryId: id,
        ledger: "personal",
        month: year,
        amount,
      });
    }
  }
  for (const [name, amount] of Object.entries(BUSINESS_BUDGETS)) {
    const id = catId("business", name);
    if (id) {
      budgetRows.push({
        workspaceId,
        categoryId: id,
        ledger: "business",
        month,
        amount,
      });
    }
  }
  for (const [name, amount] of Object.entries(BUSINESS_ANNUAL_BUDGETS)) {
    const id = catId("business", name);
    if (id) {
      budgetRows.push({
        workspaceId,
        categoryId: id,
        ledger: "business",
        month: year,
        amount,
      });
    }
  }
  if (budgetRows.length > 0) {
    await prisma.budget.createMany({ data: budgetRows });
  }

  const netflix = catId("personal", "Subscriptions");
  const adobe = catId("business", "Software");
  if (netflix) {
    await prisma.categoryRule.create({
      data: {
        workspaceId,
        ledger: "personal",
        matchField: "merchant",
        matchValue: "netflix",
        categoryId: netflix,
      },
    });
  }
  if (adobe) {
    await prisma.categoryRule.create({
      data: {
        workspaceId,
        ledger: "business",
        matchField: "merchant",
        matchValue: "adobe",
        categoryId: adobe,
      },
    });
  }

  const now = new Date();
  const txRows = buildSeedTransactions().map((tx, i) => {
    const categoryId =
      tx.categoryName != null ? catId(tx.ledger, tx.categoryName) ?? null : null;
    return {
      workspaceId,
      accountId: accountByKey[tx.accountKey],
      categoryId,
      categorySource: categoryId ? tx.categorySource ?? null : null,
      plaidTransactionId: `demo-tx-${workspaceId.slice(-8)}-${i}`,
      amount: tx.amount,
      date: subDays(now, tx.daysAgo),
      name: tx.name,
      merchantName: tx.merchantName ?? null,
      pending: tx.pending ?? false,
      ledger: tx.ledger,
      plaidCategory: tx.categoryName ?? null,
    };
  });

  await prisma.transaction.createMany({ data: txRows });
  const { ensureDefaultFunds } = await import("@/lib/funds");
  await ensureDefaultFunds(workspaceId);

  await prisma.goal.createMany({
    data: [
      {
        workspaceId,
        ledger: "personal",
        name: "Emergency fund",
        targetAmount: 15000,
        currentAmount: 4200,
        targetDate: subDays(now, -180),
        notes: "6 months of expenses",
      },
      {
        workspaceId,
        ledger: "personal",
        name: "Japan trip",
        targetAmount: 4500,
        currentAmount: 1250,
        targetDate: subDays(now, -120),
      },
      {
        workspaceId,
        ledger: "business",
        name: "New laptop",
        targetAmount: 2800,
        currentAmount: 900,
        targetDate: subDays(now, -90),
      },
    ],
  });

  // Touch workspace so refresh timing works.
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      name: DEMO_WORKSPACE_NAME,
      updatedAt: new Date(),
    },
  });
}

/**
 * Ensure the shared demo workspace exists with fresh-looking sample data.
 * Reseeds when missing or stale so the demo stays usable.
 */
export async function ensureDemoWorkspace(options?: { forceRefresh?: boolean }) {
  let user = await prisma.user.findUnique({ where: { clerkId: DEMO_CLERK_ID } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        clerkId: DEMO_CLERK_ID,
        email: DEMO_EMAIL,
        name: DEMO_USER_NAME,
      },
    });
  }

  let membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

  if (!membership) {
    const workspace = await prisma.workspace.create({
      data: {
        name: DEMO_WORKSPACE_NAME,
        memberships: {
          create: { userId: user.id, role: "owner" },
        },
      },
    });
    membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id, workspaceId: workspace.id },
      include: { workspace: true },
    });
    await populateDemoData(workspace.id);
    membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id, workspaceId: workspace.id },
      include: { workspace: true },
    });
    return { user, membership, workspace: membership.workspace, isDemo: true as const };
  }

  const workspace = membership.workspace;
  const txCount = await prisma.transaction.count({
    where: { workspaceId: workspace.id },
  });
  const stale =
    options?.forceRefresh ||
    txCount === 0 ||
    Date.now() - workspace.updatedAt.getTime() > DEMO_REFRESH_MS;

  if (stale) {
    await wipeDemoWorkspace(workspace.id);
    await populateDemoData(workspace.id);
    membership = await prisma.membership.findFirstOrThrow({
      where: { userId: user.id, workspaceId: workspace.id },
      include: { workspace: true },
    });
  }

  return {
    user,
    membership,
    workspace: membership.workspace,
    isDemo: true as const,
  };
}

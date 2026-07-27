import type { Ledger } from "@/lib/types";

export type LedgerCopy = {
  dashboardTitle: string;
  balance: string;
  spentThisMonth: string;
  incomeThisMonth: string;
  budgetRemaining: string;
  chartsSection: string;
  spend: string;
  income: string;
  savings: string;
  savingsRateSuffix: (rate: number) => string;
  incomeVsSpend: string;
  netSavings: string;
  noSavingsData: string;
  accountBalance: string;
  topCategories: string;
  budgetsLink: string;
  holdings: string;
  emptyAccountsTitle: string;
  emptyAccountsDescription: string;
  budgetsTitle: string;
  budgetsDescription: (month: string) => string;
  totalBudgeted: string;
  remaining: string;
  budgetMix: string;
  budgetMixHint: string;
  spendMix: string;
  spendMixHint: string;
  budgetColumn: string;
  navDashboard: string;
  navBudgets: string;
  accountsDescription: string;
  accountsEmpty: string;
};

const personal: LedgerCopy = {
  dashboardTitle: "Dashboard",
  balance: "Balance",
  spentThisMonth: "Spent this month",
  incomeThisMonth: "Income this month",
  budgetRemaining: "Budget remaining",
  chartsSection: "Spend & savings",
  spend: "Spend",
  income: "Income",
  savings: "Savings",
  savingsRateSuffix: (rate) => ` · ${rate.toFixed(0)}% rate`,
  incomeVsSpend: "Income vs spend",
  netSavings: "Net savings",
  noSavingsData: "No savings data in this period yet.",
  accountBalance: "Account balance over time",
  topCategories: "Top categories",
  budgetsLink: "Budgets",
  holdings: "Holdings",
  emptyAccountsTitle: "Connect your first account",
  emptyAccountsDescription:
    "Link Chase or Robinhood through Plaid to see balances and spending here.",
  budgetsTitle: "Budgets",
  budgetsDescription: (month) =>
    `Monthly limits · yearly for Travel, Insurance, Gifts · Personal · ${month}`,
  totalBudgeted: "Total budgeted (monthly)",
  remaining: "Remaining",
  budgetMix: "Budget mix",
  budgetMixHint: "How this month's budget is allocated",
  spendMix: "Spend mix",
  spendMixHint: "Where spending went this month",
  budgetColumn: "Budget",
  navDashboard: "Dashboard",
  navBudgets: "Budgets",
  accountsDescription:
    "Securely connect Chase and Robinhood via Plaid. Credentials never touch our servers.",
  accountsEmpty:
    "Connect Chase checking/credit or Robinhood brokerage. New connections are tagged with the current Personal/Business view.",
};

const business: LedgerCopy = {
  dashboardTitle: "Cash flow",
  balance: "Cash on hand",
  spentThisMonth: "Expenses",
  incomeThisMonth: "Revenue",
  budgetRemaining: "Remaining to spend",
  chartsSection: "Revenue & profit",
  spend: "Expenses",
  income: "Revenue",
  savings: "Profit",
  savingsRateSuffix: (rate) => ` · ${rate.toFixed(0)}% margin`,
  incomeVsSpend: "Revenue vs expenses",
  netSavings: "Net profit",
  noSavingsData: "No profit data in this period yet.",
  accountBalance: "Cash balance over time",
  topCategories: "Top expenses",
  budgetsLink: "Limits",
  holdings: "Investments",
  emptyAccountsTitle: "Connect a business account",
  emptyAccountsDescription:
    "Link a business checking or credit account through Plaid to see cash and expenses here.",
  budgetsTitle: "Expense limits",
  budgetsDescription: (month) =>
    `Monthly expense caps · yearly for Insurance, Taxes, Travel · Business · ${month}`,
  totalBudgeted: "Total limited (monthly)",
  remaining: "Remaining",
  budgetMix: "Limit mix",
  budgetMixHint: "How this month's expense limits are allocated",
  spendMix: "Expense mix",
  spendMixHint: "Where expenses went this month",
  budgetColumn: "Limit",
  navDashboard: "Cash flow",
  navBudgets: "Limits",
  accountsDescription:
    "Securely connect business checking and credit via Plaid. Credentials never touch our servers.",
  accountsEmpty:
    "Connect a business checking or credit account. New connections are tagged with the current Personal/Business view.",
};

export function ledgerCopy(ledger: Ledger): LedgerCopy {
  return ledger === "business" ? business : personal;
}

export function ledgerLabel(ledger: Ledger): string {
  return ledger === "business" ? "Business" : "Personal";
}

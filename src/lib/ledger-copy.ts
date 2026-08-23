import { formatMonthLabel } from "@/lib/format";
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
  spendMix: string;
  budgetColumn: string;
  navDashboard: string;
  navBudgets: string;
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
  savingsRateSuffix: (rate) => ` · ${rate.toFixed(0)}%`,
  incomeVsSpend: "Income vs spend",
  netSavings: "Net savings",
  noSavingsData: "No data in this period yet.",
  accountBalance: "Account balance",
  topCategories: "Top categories",
  budgetsLink: "Budgets",
  holdings: "Holdings",
  emptyAccountsTitle: "Connect an account",
  emptyAccountsDescription: "Link a bank through Plaid to get started.",
  budgetsTitle: "Budgets",
  budgetsDescription: (month) => `Personal · ${formatMonthLabel(month)}`,
  totalBudgeted: "Budgeted",
  remaining: "Remaining",
  budgetMix: "Budget mix",
  spendMix: "Spend mix",
  budgetColumn: "Budget",
  navDashboard: "Dashboard",
  navBudgets: "Budgets",
  accountsEmpty: "Connect a bank account to get started.",
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
  savingsRateSuffix: (rate) => ` · ${rate.toFixed(0)}%`,
  incomeVsSpend: "Revenue vs expenses",
  netSavings: "Net profit",
  noSavingsData: "No data in this period yet.",
  accountBalance: "Cash balance",
  topCategories: "Top expenses",
  budgetsLink: "Limits",
  holdings: "Investments",
  emptyAccountsTitle: "Connect an account",
  emptyAccountsDescription: "Link a bank through Plaid to get started.",
  budgetsTitle: "Expense limits",
  budgetsDescription: (month) => `Business · ${formatMonthLabel(month)}`,
  totalBudgeted: "Limited",
  remaining: "Remaining",
  budgetMix: "Limit mix",
  spendMix: "Expense mix",
  budgetColumn: "Limit",
  navDashboard: "Cash flow",
  navBudgets: "Limits",
  accountsEmpty: "Connect a bank account to get started.",
};

export function ledgerCopy(ledger: Ledger): LedgerCopy {
  return ledger === "business" ? business : personal;
}

export function ledgerLabel(ledger: Ledger): string {
  return ledger === "business" ? "Business" : "Personal";
}

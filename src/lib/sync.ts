import type { Ledger } from "@/lib/types";
import {
  loadCategoryRules,
  resolveCategory,
  reclassifyUnlockedTransactions,
  type CategoryRuleRow,
} from "@/lib/categorize";
import { prisma } from "@/lib/db";
import { decryptToken } from "@/lib/crypto";
import { getPlaidClient } from "@/lib/plaid";
import { Transaction, RemovedTransaction, InvestmentTransaction } from "plaid";

export async function syncItemTransactions(plaidItemId: string) {
  const item = await prisma.plaidItem.findUniqueOrThrow({
    where: { id: plaidItemId },
    include: { accounts: true },
  });

  const accessToken = decryptToken(item.accessTokenEnc);
  const client = getPlaidClient();
  const accountByPlaidId = new Map(
    item.accounts.map((a) => [a.plaidAccountId!, { id: a.id, ledger: a.ledger as Ledger }]),
  );

  const defaultLedger = item.defaultLedger as Ledger;
  const rulesCache = new Map<string, CategoryRuleRow[]>();

  async function rulesFor(ledger: Ledger) {
    if (!rulesCache.has(ledger)) {
      rulesCache.set(ledger, await loadCategoryRules(item.workspaceId, ledger));
    }
    return rulesCache.get(ledger)!;
  }

  let cursor = item.cursor ?? undefined;
  let hasMore = true;
  let added = 0;
  let modified = 0;
  let removed = 0;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 100,
    });
    const data = response.data;

    for (const tx of data.added) {
      await upsertBankTransaction(
        item.workspaceId,
        accountByPlaidId,
        defaultLedger,
        tx,
        rulesFor,
      );
      added += 1;
    }
    for (const tx of data.modified) {
      await upsertBankTransaction(
        item.workspaceId,
        accountByPlaidId,
        defaultLedger,
        tx,
        rulesFor,
      );
      modified += 1;
    }
    for (const tx of data.removed) {
      await removeBankTransaction(tx);
      removed += 1;
    }

    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  // Refresh balances
  const balances = await client.accountsGet({ access_token: accessToken });
  for (const acct of balances.data.accounts) {
    const local = accountByPlaidId.get(acct.account_id);
    if (!local) continue;
    await prisma.account.update({
      where: { id: local.id },
      data: {
        currentBalance: acct.balances.current ?? null,
        availableBalance: acct.balances.available ?? null,
        isoCurrencyCode: acct.balances.iso_currency_code ?? "USD",
      },
    });
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: {
      cursor: cursor ?? null,
      lastSyncedAt: new Date(),
      status: "active",
      errorCode: null,
    },
  });

  // Re-map unlocked txs with improved Plaid map + rules (helps existing "Other").
  const reclassified = await reclassifyUnlockedTransactions(item.workspaceId);

  return { added, modified, removed, reclassified };
}

async function upsertBankTransaction(
  workspaceId: string,
  accountByPlaidId: Map<string, { id: string; ledger: Ledger }>,
  defaultLedger: Ledger,
  tx: Transaction,
  rulesFor: (ledger: Ledger) => Promise<CategoryRuleRow[]>,
) {
  const account = accountByPlaidId.get(tx.account_id);
  if (!account) return;

  const ledger = account.ledger ?? defaultLedger;
  const primary = tx.personal_finance_category?.primary ?? tx.category?.[0] ?? null;
  const detailed = tx.personal_finance_category?.detailed ?? null;
  const merchantName = tx.merchant_name ?? null;
  const rules = await rulesFor(ledger);
  const resolved = await resolveCategory({
    workspaceId,
    ledger,
    name: tx.name,
    merchantName,
    plaidPrimary: primary,
    plaidDetailed: detailed,
    rules,
  });

  const existing = await prisma.transaction.findUnique({
    where: { plaidTransactionId: tx.transaction_id },
    select: { id: true, categoryId: true, categorySource: true },
  });

  if (!existing) {
    await prisma.transaction.create({
      data: {
        workspaceId,
        accountId: account.id,
        categoryId: resolved.categoryId,
        categorySource: resolved.source,
        plaidTransactionId: tx.transaction_id,
        amount: tx.amount,
        date: new Date(tx.date),
        name: tx.name,
        merchantName,
        pending: tx.pending,
        ledger,
        plaidCategory: primary,
        plaidDetailed: detailed,
        isoCurrencyCode: tx.iso_currency_code ?? "USD",
        isInvestment: false,
      },
    });
    return;
  }

  const locked = existing.categorySource === "user";
  await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      amount: tx.amount,
      date: new Date(tx.date),
      name: tx.name,
      merchantName,
      pending: tx.pending,
      plaidCategory: primary,
      plaidDetailed: detailed,
      ...(locked
        ? {}
        : {
            categoryId: resolved.categoryId,
            categorySource: resolved.source,
          }),
    },
  });
}

async function removeBankTransaction(tx: RemovedTransaction) {
  if (!tx.transaction_id) return;
  await prisma.transaction.deleteMany({
    where: { plaidTransactionId: tx.transaction_id },
  });
}

export async function syncItemInvestments(plaidItemId: string) {
  const item = await prisma.plaidItem.findUniqueOrThrow({
    where: { id: plaidItemId },
    include: { accounts: true },
  });

  const accessToken = decryptToken(item.accessTokenEnc);
  const client = getPlaidClient();
  const accountByPlaidId = new Map(
    item.accounts.map((a) => [a.plaidAccountId!, { id: a.id, ledger: a.ledger as Ledger }]),
  );

  const defaultLedger = item.defaultLedger as Ledger;

  // Holdings
  const holdingsRes = await client.investmentsHoldingsGet({ access_token: accessToken });
  const securities = new Map(
    holdingsRes.data.securities.map((s) => [s.security_id, s]),
  );

  // Clear and re-insert holdings for these accounts (simpler than diffing)
  const accountIds = item.accounts.map((a) => a.id);
  await prisma.holding.deleteMany({
    where: { accountId: { in: accountIds } },
  });

  for (const h of holdingsRes.data.holdings) {
    const account = accountByPlaidId.get(h.account_id);
    if (!account) continue;
    const security = securities.get(h.security_id);
    await prisma.holding.create({
      data: {
        workspaceId: item.workspaceId,
        accountId: account.id,
        plaidSecurityId: h.security_id,
        symbol: security?.ticker_symbol ?? null,
        name: security?.name ?? "Unknown security",
        quantity: h.quantity,
        price: h.institution_price ?? null,
        value: h.institution_value ?? null,
        costBasis: h.cost_basis ?? null,
        isoCurrencyCode: h.iso_currency_code ?? "USD",
        asOf: h.institution_price_as_of
          ? new Date(h.institution_price_as_of)
          : new Date(),
      },
    });
  }

  // Investment transactions (last 90 days on first sync, then rolling window)
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    const res = await client.investmentsTransactionsGet({
      access_token: accessToken,
      start_date: startStr,
      end_date: endStr,
      options: { offset, count: 100 },
    });
    total = res.data.total_investment_transactions;
    const secMap = new Map(res.data.securities.map((s) => [s.security_id, s]));

    for (const tx of res.data.investment_transactions) {
      await upsertInvestmentTransaction(
        item.workspaceId,
        accountByPlaidId,
        defaultLedger,
        tx,
        secMap.get(tx.security_id ?? "")?.ticker_symbol ?? null,
      );
    }
    offset += res.data.investment_transactions.length;
    if (res.data.investment_transactions.length === 0) break;
  }

  // Refresh balances
  for (const acct of holdingsRes.data.accounts) {
    const local = accountByPlaidId.get(acct.account_id);
    if (!local) continue;
    await prisma.account.update({
      where: { id: local.id },
      data: {
        currentBalance: acct.balances.current ?? null,
        availableBalance: acct.balances.available ?? null,
        isoCurrencyCode: acct.balances.iso_currency_code ?? "USD",
      },
    });
  }

  await prisma.plaidItem.update({
    where: { id: item.id },
    data: {
      lastSyncedAt: new Date(),
      status: "active",
      errorCode: null,
    },
  });
}

async function upsertInvestmentTransaction(
  workspaceId: string,
  accountByPlaidId: Map<string, { id: string; ledger: Ledger }>,
  defaultLedger: Ledger,
  tx: InvestmentTransaction,
  symbol: string | null,
) {
  const account = accountByPlaidId.get(tx.account_id);
  if (!account) return;

  const ledger = account.ledger ?? defaultLedger;
  // Investment tx amounts: positive = outflow (buy), negative = inflow (sell)
  const name = [tx.name, symbol].filter(Boolean).join(" · ");
  const resolved = await resolveCategory({
    workspaceId,
    ledger,
    name,
    merchantName: symbol,
    plaidPrimary: "TRANSFER_OUT",
    plaidDetailed: null,
  });

  const existing = await prisma.transaction.findUnique({
    where: { plaidTransactionId: tx.investment_transaction_id },
    select: { id: true, categorySource: true },
  });

  if (!existing) {
    await prisma.transaction.create({
      data: {
        workspaceId,
        accountId: account.id,
        categoryId: resolved.categoryId,
        categorySource: resolved.source,
        plaidTransactionId: tx.investment_transaction_id,
        amount: tx.amount,
        date: new Date(tx.date),
        name,
        merchantName: symbol,
        pending: false,
        ledger,
        plaidCategory: tx.type,
        isoCurrencyCode: tx.iso_currency_code ?? "USD",
        isInvestment: true,
        investmentType: tx.subtype ?? tx.type,
      },
    });
    return;
  }

  const locked = existing.categorySource === "user";
  await prisma.transaction.update({
    where: { id: existing.id },
    data: {
      amount: tx.amount,
      date: new Date(tx.date),
      name,
      merchantName: symbol,
      investmentType: tx.subtype ?? tx.type,
      ...(locked
        ? {}
        : {
            categoryId: resolved.categoryId,
            categorySource: resolved.source,
          }),
    },
  });
}

export async function syncPlaidItem(plaidItemId: string) {
  const item = await prisma.plaidItem.findUniqueOrThrow({ where: { id: plaidItemId } });
  const products = item.products.split(",").map((p) => p.trim());

  const results: Record<string, unknown> = {};

  if (products.includes("transactions") || products.includes("assets")) {
    try {
      results.transactions = await syncItemTransactions(plaidItemId);
    } catch (err) {
      // Item may be investments-only
      results.transactionsError = err instanceof Error ? err.message : String(err);
    }
  }

  if (products.includes("investments")) {
    try {
      results.investments = await syncItemInvestments(plaidItemId);
    } catch (err) {
      results.investmentsError = err instanceof Error ? err.message : String(err);
    }
  }

  return results;
}

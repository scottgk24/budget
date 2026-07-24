import type { Ledger } from "@/lib/types";
import {
  type CategorySource,
  mapPlaidCategory,
  normalizeMatchValue,
} from "@/lib/categories";
import { prisma } from "@/lib/db";

export type CategoryRuleRow = {
  matchField: string;
  matchValue: string;
  categoryId: string;
};

export type ResolvedCategory = {
  categoryId: string | undefined;
  source: CategorySource;
};

/** Load rules for a workspace ledger (merchant exact, then name contains). */
export async function loadCategoryRules(
  workspaceId: string,
  ledger: Ledger,
): Promise<CategoryRuleRow[]> {
  const rules = await prisma.categoryRule.findMany({
    where: { workspaceId, ledger },
    select: { matchField: true, matchValue: true, categoryId: true },
  });
  // Prefer longer name-substring matches by sorting name rules longest-first.
  return rules.sort((a, b) => {
    if (a.matchField !== b.matchField) {
      return a.matchField === "merchant" ? -1 : 1;
    }
    return b.matchValue.length - a.matchValue.length;
  });
}

export function matchRuleCategoryId(
  rules: CategoryRuleRow[],
  merchantName: string | null | undefined,
  name: string,
): string | undefined {
  const merchant = merchantName ? normalizeMatchValue(merchantName) : null;
  if (merchant) {
    const hit = rules.find(
      (r) => r.matchField === "merchant" && r.matchValue === merchant,
    );
    if (hit) return hit.categoryId;
  }

  const nameNorm = normalizeMatchValue(name);
  for (const r of rules) {
    if (r.matchField !== "name") continue;
    if (nameNorm.includes(r.matchValue)) return r.categoryId;
  }
  return undefined;
}

async function categoryIdByName(
  workspaceId: string,
  ledger: Ledger,
  name: string,
): Promise<string | undefined> {
  const category = await prisma.category.findFirst({
    where: { workspaceId, ledger, name },
    select: { id: true },
  });
  return category?.id;
}

/** Resolve category: merchant/name rules first, then Plaid detailed/primary. */
export async function resolveCategory(opts: {
  workspaceId: string;
  ledger: Ledger;
  name: string;
  merchantName?: string | null;
  plaidPrimary?: string | null;
  plaidDetailed?: string | null;
  rules?: CategoryRuleRow[];
}): Promise<ResolvedCategory> {
  const rules =
    opts.rules ?? (await loadCategoryRules(opts.workspaceId, opts.ledger));

  const ruleId = matchRuleCategoryId(rules, opts.merchantName, opts.name);
  if (ruleId) return { categoryId: ruleId, source: "rule" };

  const mapped = mapPlaidCategory(
    opts.plaidPrimary,
    opts.ledger,
    opts.plaidDetailed,
  );
  const categoryId = await categoryIdByName(opts.workspaceId, opts.ledger, mapped);
  return { categoryId, source: "plaid" };
}

/**
 * Re-apply rules + improved Plaid map to unlocked transactions
 * (categorySource is null or "plaid"). User-locked rows stay put.
 */
export async function reclassifyUnlockedTransactions(
  workspaceId: string,
  ledger?: Ledger,
): Promise<number> {
  const txs = await prisma.transaction.findMany({
    where: {
      workspaceId,
      ...(ledger ? { ledger } : {}),
      OR: [{ categorySource: null }, { categorySource: "plaid" }],
      isInvestment: false,
    },
    select: {
      id: true,
      ledger: true,
      name: true,
      merchantName: true,
      plaidCategory: true,
      plaidDetailed: true,
      categoryId: true,
    },
  });

  const rulesByLedger = new Map<string, CategoryRuleRow[]>();
  const categoryIdCache = new Map<string, string | undefined>();
  let updated = 0;

  async function idForName(led: Ledger, name: string) {
    const key = `${led}:${name}`;
    if (!categoryIdCache.has(key)) {
      categoryIdCache.set(key, await categoryIdByName(workspaceId, led, name));
    }
    return categoryIdCache.get(key);
  }

  for (const tx of txs) {
    const led = tx.ledger as Ledger;
    if (!rulesByLedger.has(led)) {
      rulesByLedger.set(led, await loadCategoryRules(workspaceId, led));
    }
    const rules = rulesByLedger.get(led)!;
    const ruleId = matchRuleCategoryId(rules, tx.merchantName, tx.name);

    let categoryId: string | undefined;
    let source: CategorySource;
    if (ruleId) {
      categoryId = ruleId;
      source = "rule";
    } else {
      const mapped = mapPlaidCategory(tx.plaidCategory, led, tx.plaidDetailed);
      categoryId = await idForName(led, mapped);
      source = "plaid";
    }

    if (categoryId !== tx.categoryId) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          categoryId: categoryId ?? null,
          categorySource: source,
        },
      });
      updated += 1;
    }
  }

  return updated;
}

/** Create/upsert a merchant rule and optionally apply to matching past txs. */
export async function upsertMerchantRule(opts: {
  workspaceId: string;
  ledger: Ledger;
  merchantName: string;
  categoryId: string;
  applyToPast?: boolean;
}): Promise<{ ruleId: string; applied: number }> {
  const matchValue = normalizeMatchValue(opts.merchantName);
  if (!matchValue) {
    throw new Error("Merchant name required");
  }

  const rule = await prisma.categoryRule.upsert({
    where: {
      workspaceId_ledger_matchField_matchValue: {
        workspaceId: opts.workspaceId,
        ledger: opts.ledger,
        matchField: "merchant",
        matchValue,
      },
    },
    create: {
      workspaceId: opts.workspaceId,
      ledger: opts.ledger,
      matchField: "merchant",
      matchValue,
      categoryId: opts.categoryId,
    },
    update: { categoryId: opts.categoryId },
  });

  let applied = 0;
  if (opts.applyToPast !== false) {
    // Match merchantName case-insensitively via normalized compare in JS
    // (Postgres may not have citext). Pull candidates then filter.
    const candidates = await prisma.transaction.findMany({
      where: {
        workspaceId: opts.workspaceId,
        ledger: opts.ledger,
        merchantName: { not: null },
        OR: [{ categorySource: null }, { categorySource: "plaid" }, { categorySource: "rule" }],
      },
      select: { id: true, merchantName: true },
    });

    const ids = candidates
      .filter((t) => normalizeMatchValue(t.merchantName ?? "") === matchValue)
      .map((t) => t.id);

    if (ids.length > 0) {
      const result = await prisma.transaction.updateMany({
        where: { id: { in: ids } },
        data: { categoryId: opts.categoryId, categorySource: "rule" },
      });
      applied = result.count;
    }
  }

  return { ruleId: rule.id, applied };
}

import { addMonths, parseISO } from "date-fns";
import {
  defaultFundSlugForCategoryName,
  fundKindForSlug,
  isAnnualBudgetPeriod,
  isIncomeAmount,
  isSpendAmount,
  NON_SPEND_CATEGORIES,
  type FundKind,
} from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  monthKey,
  monthRange,
  monthlyAllotment,
  yearFromPeriod,
} from "@/lib/format";
import type { Ledger } from "@/lib/types";

export const PERSONAL_FUND_DEFS = [
  { slug: "buffer", name: "Buffer", kind: "buffer" as const, sortOrder: 0 },
  { slug: "committed", name: "Committed", kind: "committed" as const, sortOrder: 1 },
  { slug: "flexible", name: "Flexible", kind: "flexible" as const, sortOrder: 2 },
  { slug: "home", name: "Home", kind: "reserve" as const, sortOrder: 10 },
  { slug: "car", name: "Car", kind: "reserve" as const, sortOrder: 11 },
  { slug: "travel", name: "Travel", kind: "reserve" as const, sortOrder: 12 },
  { slug: "gifts", name: "Gifts", kind: "reserve" as const, sortOrder: 13 },
  { slug: "emergency", name: "Emergency", kind: "reserve" as const, sortOrder: 14 },
] as const;

const RESERVE_SEED_FROM_CATEGORY: Record<string, string> = {
  home: "Home Improvement",
  travel: "Travel",
  gifts: "Gifts",
};

const FUND_SELECT = {
  id: true,
  name: true,
  slug: true,
  kind: true,
  sortOrder: true,
  monthlyContribution: true,
} as const;

export type FundRow = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  sortOrder: number;
  monthlyContribution: number;
};

export type FundMonthSnapshot = {
  month: string;
  income: number;
  committedNeed: number;
  flexibleAssigned: number;
  flexibleSpent: number;
  carriedOverspend: number;
  bufferOpening: number;
  bufferCovered: number;
  leftoverToBuffer: number;
  uncoveredOverspend: number;
  bufferClosing: number;
  reservesUnderfunded: boolean;
  funds: Array<{
    id: string;
    name: string;
    slug: string;
    kind: FundKind;
    contribution: number;
    assigned: number;
    spent: number;
    coveredOut: number;
    opening: number;
    closing: number;
  }>;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthsThrough(throughMonth: string, count: number): string[] {
  const end = parseISO(`${throughMonth}-01`);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(monthKey(addMonths(end, -i)));
  }
  return months;
}

export async function loadPersonalFundLookup(workspaceId: string): Promise<{
  bySlug: Map<string, FundRow>;
  byCategoryId: Map<string, string>;
  flexibleId: string | null;
}> {
  await ensureDefaultFunds(workspaceId);
  const [funds, categories] = await Promise.all([
    prisma.fund.findMany({
      where: { workspaceId, ledger: "personal" },
      select: FUND_SELECT,
    }),
    prisma.category.findMany({
      where: { workspaceId, ledger: "personal" },
      select: { id: true, name: true, defaultFundId: true },
    }),
  ]);
  const bySlug = new Map(funds.map((f) => [f.slug, f]));
  const flexibleId = bySlug.get("flexible")?.id ?? null;
  const byCategoryId = new Map<string, string>();
  for (const cat of categories) {
    const slug = defaultFundSlugForCategoryName(cat.name);
    const id = cat.defaultFundId ?? (slug ? bySlug.get(slug)?.id : null) ?? (slug === null ? null : flexibleId);
    if (id) byCategoryId.set(cat.id, id);
  }
  return { bySlug, byCategoryId, flexibleId };
}

export async function fundIdForCategory(opts: {
  workspaceId: string;
  ledger: Ledger;
  categoryId: string | null | undefined;
  fundsBySlug?: Map<string, FundRow>;
}): Promise<string | null> {
  if (opts.ledger !== "personal") return null;

  const funds =
    opts.fundsBySlug ??
    new Map(
      (
        await prisma.fund.findMany({
          where: { workspaceId: opts.workspaceId, ledger: "personal" },
          select: FUND_SELECT,
        })
      ).map((f) => [f.slug, f]),
    );

  if (!opts.categoryId) {
    return funds.get("flexible")?.id ?? null;
  }

  const category = await prisma.category.findFirst({
    where: { id: opts.categoryId, workspaceId: opts.workspaceId },
    select: { name: true, defaultFundId: true, ledger: true },
  });
  if (!category || category.ledger !== "personal") return null;
  if (category.defaultFundId) return category.defaultFundId;

  const slug = defaultFundSlugForCategoryName(category.name);
  if (!slug) return null;
  return funds.get(slug)?.id ?? funds.get("flexible")?.id ?? null;
}

export async function fundFieldsForCategoryChange(opts: {
  workspaceId: string;
  ledger: Ledger;
  categoryId: string | null | undefined;
  currentFundSource?: string | null;
  currentFundId?: string | null;
}): Promise<{ fundId: string | null; fundSource: string | null } | Record<string, never>> {
  if (opts.currentFundSource === "user") return {};
  if (opts.ledger !== "personal") {
    return { fundId: null, fundSource: null };
  }
  const fundId = await fundIdForCategory({
    workspaceId: opts.workspaceId,
    ledger: opts.ledger,
    categoryId: opts.categoryId,
  });
  return { fundId, fundSource: fundId ? "category" : null };
}

/** Insert default personal funds, map categories, backfill unlocked transactions. */
export async function ensureDefaultFunds(workspaceId: string): Promise<void> {
  const existing = await prisma.fund.findMany({
    where: { workspaceId, ledger: "personal" },
    select: FUND_SELECT,
  });
  const have = new Set(existing.map((f) => f.slug));
  const missing = PERSONAL_FUND_DEFS.filter((d) => !have.has(d.slug));
  if (missing.length > 0) {
    await prisma.fund.createMany({
      data: missing.map((d) => ({
        workspaceId,
        ledger: "personal",
        name: d.name,
        slug: d.slug,
        kind: d.kind,
        sortOrder: d.sortOrder,
      })),
    });
  }

  const funds = await prisma.fund.findMany({
    where: { workspaceId, ledger: "personal" },
    select: FUND_SELECT,
  });
  const bySlug = new Map(funds.map((f) => [f.slug, f]));

  const year = yearFromPeriod(monthKey());
  for (const [slug, categoryName] of Object.entries(RESERVE_SEED_FROM_CATEGORY)) {
    const fund = bySlug.get(slug);
    if (!fund || fund.monthlyContribution > 0) continue;
    const category = await prisma.category.findFirst({
      where: { workspaceId, ledger: "personal", name: categoryName },
      select: { id: true },
    });
    if (!category) continue;
    const budget = await prisma.budget.findFirst({
      where: {
        workspaceId,
        categoryId: category.id,
        ledger: "personal",
        month: year,
      },
      select: { amount: true },
    });
    if (budget && budget.amount > 0) {
      await prisma.fund.update({
        where: { id: fund.id },
        data: { monthlyContribution: monthlyAllotment(budget.amount) },
      });
      fund.monthlyContribution = monthlyAllotment(budget.amount);
    }
  }

  const categories = await prisma.category.findMany({
    where: { workspaceId, ledger: "personal", defaultFundId: null },
    select: { id: true, name: true },
  });
  for (const cat of categories) {
    const slug = defaultFundSlugForCategoryName(cat.name);
    if (!slug) continue;
    const fund = bySlug.get(slug);
    if (!fund) continue;
    await prisma.category.update({
      where: { id: cat.id },
      data: { defaultFundId: fund.id },
    });
  }

  const unlocked = await prisma.transaction.findMany({
    where: {
      workspaceId,
      ledger: "personal",
      fundId: null,
      OR: [{ fundSource: null }, { fundSource: "category" }],
    },
    select: { id: true, categoryId: true, category: { select: { defaultFundId: true, name: true } } },
  });
  if (unlocked.length === 0) return;

  const flexibleId = bySlug.get("flexible")?.id ?? null;
  const updates = new Map<string, string[]>();
  for (const tx of unlocked) {
    const slug = defaultFundSlugForCategoryName(tx.category?.name ?? null);
    const fundId =
      tx.category?.defaultFundId ??
      (slug ? bySlug.get(slug)?.id : null) ??
      (slug === null ? null : flexibleId);
    if (!fundId) continue;
    const list = updates.get(fundId) ?? [];
    list.push(tx.id);
    updates.set(fundId, list);
  }
  for (const [fundId, ids] of updates) {
    await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { fundId, fundSource: "category" },
    });
  }
}

export async function computeFundMonth(opts: {
  workspaceId: string;
  month: string;
  lookbackMonths?: number;
}): Promise<FundMonthSnapshot | null> {
  await ensureDefaultFunds(opts.workspaceId);
  const lookback = opts.lookbackMonths ?? 12;
  const months = monthsThrough(opts.month, lookback);
  const start = monthRange(months[0]!).start;
  const end = monthRange(opts.month).end;

  const [funds, categories, budgets, transactions, covers] = await Promise.all([
    prisma.fund.findMany({
      where: { workspaceId: opts.workspaceId, ledger: "personal" },
      select: FUND_SELECT,
      orderBy: { sortOrder: "asc" },
    }),
    prisma.category.findMany({
      where: { workspaceId: opts.workspaceId, ledger: "personal" },
      select: { id: true, name: true, budgetPeriod: true, defaultFundId: true },
    }),
    prisma.budget.findMany({
      where: {
        workspaceId: opts.workspaceId,
        ledger: "personal",
        month: { in: [...new Set([...months, ...months.map(yearFromPeriod)])] },
      },
      select: { categoryId: true, month: true, amount: true },
    }),
    prisma.transaction.findMany({
      where: {
        workspaceId: opts.workspaceId,
        ledger: "personal",
        pending: false,
        date: { gte: start, lte: end },
      },
      select: {
        amount: true,
        date: true,
        fundId: true,
        category: { select: { name: true, defaultFundId: true } },
      },
    }),
    prisma.fundCover.findMany({
      where: {
        workspaceId: opts.workspaceId,
        ledger: "personal",
        month: { in: months },
      },
      select: { month: true, fromFundId: true, amount: true },
    }),
  ]);

  if (funds.length === 0) return null;

  const flexible = funds.find((f) => f.slug === "flexible");
  const buffer = funds.find((f) => f.slug === "buffer");
  const committed = funds.find((f) => f.slug === "committed");
  if (!flexible || !buffer || !committed) return null;

  const committedCatIds = new Set(
    categories.filter((c) => c.defaultFundId === committed.id).map((c) => c.id),
  );

  const budgetByMonthCat = new Map<string, number>();
  for (const b of budgets) {
    budgetByMonthCat.set(`${b.month}:${b.categoryId}`, b.amount);
  }

  function committedNeedFor(month: string): number {
    const year = yearFromPeriod(month);
    let need = 0;
    for (const cat of categories) {
      if (!committedCatIds.has(cat.id)) continue;
      if ((NON_SPEND_CATEGORIES as readonly string[]).includes(cat.name)) continue;
      const annual = isAnnualBudgetPeriod(cat.budgetPeriod);
      const amount = budgetByMonthCat.get(`${annual ? year : month}:${cat.id}`) ?? 0;
      need += annual ? monthlyAllotment(amount) : amount;
    }
    return round2(need);
  }

  const incomeByMonth = new Map<string, number>();
  const spendByMonthFund = new Map<string, number>();
  for (const tx of transactions) {
    const m = monthKey(tx.date);
    const name = tx.category?.name;
    if (isIncomeAmount(tx.amount, name)) {
      incomeByMonth.set(m, (incomeByMonth.get(m) ?? 0) + Math.abs(tx.amount));
      continue;
    }
    if (!isSpendAmount(tx.amount, name)) continue;
    const fundId =
      tx.fundId ??
      tx.category?.defaultFundId ??
      (defaultFundSlugForCategoryName(name)
        ? funds.find((f) => f.slug === defaultFundSlugForCategoryName(name))?.id
        : null) ??
      flexible.id;
    const key = `${m}:${fundId}`;
    spendByMonthFund.set(key, (spendByMonthFund.get(key) ?? 0) + tx.amount);
  }

  const coversByMonth = new Map<string, Array<{ fromFundId: string; amount: number }>>();
  for (const c of covers) {
    const list = coversByMonth.get(c.month) ?? [];
    list.push({ fromFundId: c.fromFundId, amount: c.amount });
    coversByMonth.set(c.month, list);
  }

  let carriedOverspend = 0;
  let bufferClosing = 0;
  const reserveClosing = new Map<string, number>(
    funds.filter((f) => f.kind === "reserve").map((f) => [f.id, 0]),
  );

  let snapshot: FundMonthSnapshot | null = null;

  for (const month of months) {
    const income = round2(incomeByMonth.get(month) ?? 0);
    const committedNeed = committedNeedFor(month);
    const available = Math.max(0, round2(income - committedNeed));

    const reserves = funds.filter((f) => f.kind === "reserve");
    const reserveTarget = round2(
      reserves.reduce((sum, f) => sum + f.monthlyContribution, 0),
    );
    const scale =
      reserveTarget > 0 && available < reserveTarget ? available / reserveTarget : 1;
    const reservesUnderfunded = scale < 1 - 1e-9;
    const assignedByFund = new Map<string, number>();
    assignedByFund.set(committed.id, committedNeed);
    let reserveAssignedTotal = 0;
    for (const f of reserves) {
      const assigned = round2(f.monthlyContribution * scale);
      assignedByFund.set(f.id, assigned);
      reserveAssignedTotal += assigned;
    }
    const flexibleAssigned = round2(Math.max(0, available - reserveAssignedTotal));
    assignedByFund.set(flexible.id, flexibleAssigned);
    assignedByFund.set(buffer.id, 0);

    const monthCovers = coversByMonth.get(month) ?? [];
    const coveredOut = new Map<string, number>();
    let coverTotal = 0;
    for (const c of monthCovers) {
      coveredOut.set(c.fromFundId, (coveredOut.get(c.fromFundId) ?? 0) + c.amount);
      coverTotal += c.amount;
    }
    coverTotal = round2(coverTotal);

    const spentByFund = new Map<string, number>();
    for (const f of funds) {
      spentByFund.set(f.id, round2(spendByMonthFund.get(`${month}:${f.id}`) ?? 0));
    }
    const flexibleSpent = spentByFund.get(flexible.id) ?? 0;

    const bufferOpening = bufferClosing;
    const netFlex = round2(flexibleAssigned - carriedOverspend - flexibleSpent);
    const leftover = Math.max(0, netFlex);
    const overspend = Math.max(0, -netFlex);
    const bufferCovered = round2(Math.min(overspend, bufferOpening));
    const uncovered = round2(Math.max(0, overspend - bufferCovered - coverTotal));
    bufferClosing = round2(bufferOpening - bufferCovered + leftover);

    const fundRows: FundMonthSnapshot["funds"] = funds.map((f) => {
      const kind = (fundKindForSlug(f.slug) ?? f.kind) as FundKind;
      const assigned = assignedByFund.get(f.id) ?? 0;
      const spent = spentByFund.get(f.id) ?? 0;
      const out = round2(coveredOut.get(f.id) ?? 0);
      if (f.slug === "buffer") {
        return {
          id: f.id,
          name: f.name,
          slug: f.slug,
          kind,
          contribution: 0,
          assigned: 0,
          spent: bufferCovered,
          coveredOut: 0,
          opening: bufferOpening,
          closing: bufferClosing,
        };
      }
      if (f.kind === "reserve") {
        const opening = reserveClosing.get(f.id) ?? 0;
        const closing = round2(opening + assigned - spent - out);
        reserveClosing.set(f.id, closing);
        return {
          id: f.id,
          name: f.name,
          slug: f.slug,
          kind,
          contribution: f.monthlyContribution,
          assigned,
          spent,
          coveredOut: out,
          opening,
          closing,
        };
      }
      return {
        id: f.id,
        name: f.name,
        slug: f.slug,
        kind,
        contribution: 0,
        assigned,
        spent,
        coveredOut: 0,
        opening: 0,
        closing: 0,
      };
    });

    snapshot = {
      month,
      income,
      committedNeed,
      flexibleAssigned,
      flexibleSpent,
      carriedOverspend,
      bufferOpening,
      bufferCovered,
      leftoverToBuffer: leftover,
      uncoveredOverspend: uncovered,
      bufferClosing,
      reservesUnderfunded,
      funds: fundRows,
    };
    carriedOverspend = uncovered;
  }

  return snapshot;
}

export function fundKindFromTx(opts: {
  fundSlug?: string | null;
  fundKind?: string | null;
  categoryName?: string | null;
}): FundKind | null {
  if (opts.fundKind === "committed" || opts.fundKind === "flexible" || opts.fundKind === "reserve" || opts.fundKind === "buffer") {
    return opts.fundKind;
  }
  if (opts.fundSlug) return fundKindForSlug(opts.fundSlug);
  const slug = defaultFundSlugForCategoryName(opts.categoryName);
  return fundKindForSlug(slug);
}

import { z } from "zod";
import {
  defaultAnnualCategoriesForLedger,
  defaultBudgetPeriodForName,
  defaultCategoriesForLedger,
} from "@/lib/categories";
import { prisma } from "@/lib/db";
import { ensureDefaultFunds } from "@/lib/funds";
import type { LedgerKind } from "@/lib/types";

export const LEDGER_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const ledgerSlugSchema = z.string().regex(LEDGER_SLUG_RE);
export const ledgerKindSchema = z.enum(["personal", "business"]);

export type WorkspaceLedgerDTO = {
  id: string;
  slug: string;
  name: string;
  kind: LedgerKind;
  isSystem: boolean;
  sortOrder: number;
};

function toKind(value: string): LedgerKind {
  return value === "business" ? "business" : "personal";
}

export function slugifyLedgerName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "ledger";
}

export async function listWorkspaceLedgers(workspaceId: string): Promise<WorkspaceLedgerDTO[]> {
  const rows = await prisma.workspaceLedger.findMany({
    where: { workspaceId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    kind: toKind(row.kind),
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
  }));
}

export async function ensureWorkspaceLedgers(workspaceId: string): Promise<WorkspaceLedgerDTO[]> {
  const existing = await listWorkspaceLedgers(workspaceId);
  const have = new Set(existing.map((row) => row.slug));
  if (!have.has("personal")) {
    await prisma.workspaceLedger.create({
      data: {
        workspaceId,
        slug: "personal",
        name: "Personal",
        kind: "personal",
        isSystem: true,
        sortOrder: 0,
      },
    });
  }
  if (!have.has("business")) {
    await prisma.workspaceLedger.create({
      data: {
        workspaceId,
        slug: "business",
        name: "Business",
        kind: "business",
        isSystem: true,
        sortOrder: 1,
      },
    });
  }
  return listWorkspaceLedgers(workspaceId);
}

export async function getWorkspaceLedger(
  workspaceId: string,
  slug: string,
): Promise<WorkspaceLedgerDTO | null> {
  const rows = await ensureWorkspaceLedgers(workspaceId);
  return rows.find((row) => row.slug === slug) ?? null;
}

export async function isPersonalLedger(workspaceId: string, slug: string): Promise<boolean> {
  const row = await getWorkspaceLedger(workspaceId, slug);
  return (row?.kind ?? (slug === "business" ? "business" : "personal")) === "personal";
}

export async function seedCategoriesForLedger(
  workspaceId: string,
  slug: string,
  kind: LedgerKind,
): Promise<void> {
  const names = defaultCategoriesForLedger(kind);
  const existing = await prisma.category.findMany({
    where: { workspaceId, ledger: slug },
    select: { name: true },
  });
  const have = new Set(existing.map((c) => c.name));
  const missing = names
    .filter((name) => !have.has(name))
    .map((name) => ({
      workspaceId,
      name,
      ledger: slug,
      isDefault: true,
      budgetPeriod: defaultBudgetPeriodForName(name, kind),
    }));
  if (missing.length > 0) {
    await prisma.category.createMany({ data: missing });
  }
  const annual = defaultAnnualCategoriesForLedger(kind);
  if (annual.length > 0) {
    await prisma.category.updateMany({
      where: {
        workspaceId,
        ledger: slug,
        name: { in: [...annual] },
        budgetPeriod: "monthly",
      },
      data: { budgetPeriod: "annual" },
    });
  }
  if (kind === "personal") {
    await ensureDefaultFunds(workspaceId, slug);
  }
}

export async function createWorkspaceLedger(opts: {
  workspaceId: string;
  name: string;
  kind: LedgerKind;
}): Promise<WorkspaceLedgerDTO> {
  const name = opts.name.trim();
  if (name.length < 1 || name.length > 40) {
    throw new Error("Name must be 1–40 characters");
  }
  const existing = await ensureWorkspaceLedgers(opts.workspaceId);
  if (existing.length >= 12) {
    throw new Error("You can have at most 12 ledgers");
  }
  let slug = slugifyLedgerName(name);
  const taken = (s: string) =>
    s === "personal" || s === "business" || existing.some((row) => row.slug === s);
  if (taken(slug)) {
    const base = taken(slugifyLedgerName(name)) ? `${slugifyLedgerName(name)}-extra` : slug;
    slug = base;
    let n = 2;
    while (taken(slug)) {
      slug = `${base}-${n}`;
      n += 1;
    }
  }
  const created = await prisma.workspaceLedger.create({
    data: {
      workspaceId: opts.workspaceId,
      slug,
      name,
      kind: opts.kind,
      isSystem: false,
      sortOrder: existing.length,
    },
  });
  await seedCategoriesForLedger(opts.workspaceId, created.slug, opts.kind);
  return {
    id: created.id,
    slug: created.slug,
    name: created.name,
    kind: opts.kind,
    isSystem: false,
    sortOrder: created.sortOrder,
  };
}

export async function renameWorkspaceLedger(opts: {
  workspaceId: string;
  id: string;
  name: string;
}): Promise<WorkspaceLedgerDTO> {
  const name = opts.name.trim();
  if (name.length < 1 || name.length > 40) {
    throw new Error("Name must be 1–40 characters");
  }
  const existing = await prisma.workspaceLedger.findFirst({
    where: { id: opts.id, workspaceId: opts.workspaceId },
  });
  if (!existing) throw new Error("Ledger not found");
  const updated = await prisma.workspaceLedger.update({
    where: { id: existing.id },
    data: { name },
  });
  return {
    id: updated.id,
    slug: updated.slug,
    name: updated.name,
    kind: toKind(updated.kind),
    isSystem: updated.isSystem,
    sortOrder: updated.sortOrder,
  };
}

export async function deleteWorkspaceLedger(opts: {
  workspaceId: string;
  id: string;
}): Promise<void> {
  const existing = await prisma.workspaceLedger.findFirst({
    where: { id: opts.id, workspaceId: opts.workspaceId },
  });
  if (!existing) throw new Error("Ledger not found");
  if (existing.isSystem || existing.slug === "personal" || existing.slug === "business") {
    throw new Error("The default Personal and Business ledgers cannot be deleted");
  }
  const [accounts, txs] = await Promise.all([
    prisma.account.count({ where: { workspaceId: opts.workspaceId, ledger: existing.slug } }),
    prisma.transaction.count({ where: { workspaceId: opts.workspaceId, ledger: existing.slug } }),
  ]);
  if (accounts > 0 || txs > 0) {
    throw new Error("Move accounts off this ledger before deleting it");
  }
  await prisma.$transaction([
    prisma.budget.deleteMany({ where: { workspaceId: opts.workspaceId, ledger: existing.slug } }),
    prisma.categoryRule.deleteMany({
      where: { workspaceId: opts.workspaceId, ledger: existing.slug },
    }),
    prisma.goal.deleteMany({ where: { workspaceId: opts.workspaceId, ledger: existing.slug } }),
    prisma.fundCover.deleteMany({ where: { workspaceId: opts.workspaceId, ledger: existing.slug } }),
    prisma.fund.deleteMany({ where: { workspaceId: opts.workspaceId, ledger: existing.slug } }),
    prisma.netWorthSnapshot.deleteMany({
      where: { workspaceId: opts.workspaceId, ledger: existing.slug },
    }),
    prisma.category.deleteMany({ where: { workspaceId: opts.workspaceId, ledger: existing.slug } }),
    prisma.workspaceLedger.delete({ where: { id: existing.id } }),
  ]);
}

export async function remapCategoryToLedger(opts: {
  workspaceId: string;
  fromCategoryId: string | null;
  toLedger: string;
}): Promise<string | null> {
  if (!opts.fromCategoryId) return null;
  const from = await prisma.category.findFirst({
    where: { id: opts.fromCategoryId, workspaceId: opts.workspaceId },
    select: { name: true },
  });
  if (!from) return null;
  const dest = await prisma.category.findFirst({
    where: { workspaceId: opts.workspaceId, ledger: opts.toLedger, name: from.name },
    select: { id: true },
  });
  return dest?.id ?? null;
}

export async function moveAccountToLedger(opts: {
  workspaceId: string;
  accountId: string;
  toLedger: string;
}): Promise<void> {
  const dest = await getWorkspaceLedger(opts.workspaceId, opts.toLedger);
  if (!dest) throw new Error("Unknown ledger");
  const account = await prisma.account.findFirst({
    where: { id: opts.accountId, workspaceId: opts.workspaceId },
  });
  if (!account) throw new Error("Account not found");
  const txs = await prisma.transaction.findMany({
    where: { accountId: account.id, workspaceId: opts.workspaceId },
    select: { id: true, categoryId: true },
  });
  await prisma.account.update({
    where: { id: account.id },
    data: { ledger: dest.slug },
  });
  for (const tx of txs) {
    const categoryId = await remapCategoryToLedger({
      workspaceId: opts.workspaceId,
      fromCategoryId: tx.categoryId,
      toLedger: dest.slug,
    });
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        ledger: dest.slug,
        categoryId,
        ...(dest.kind === "personal" ? {} : { fundId: null, fundSource: null }),
      },
    });
  }
}

export async function moveTransactionToLedger(opts: {
  workspaceId: string;
  transactionId: string;
  toLedger: string;
}): Promise<void> {
  const dest = await getWorkspaceLedger(opts.workspaceId, opts.toLedger);
  if (!dest) throw new Error("Unknown ledger");
  const tx = await prisma.transaction.findFirst({
    where: { id: opts.transactionId, workspaceId: opts.workspaceId },
  });
  if (!tx) throw new Error("Transaction not found");
  const categoryId = await remapCategoryToLedger({
    workspaceId: opts.workspaceId,
    fromCategoryId: tx.categoryId,
    toLedger: dest.slug,
  });
  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      ledger: dest.slug,
      categoryId,
      ...(dest.kind === "personal" ? {} : { fundId: null, fundSource: null }),
    },
  });
}

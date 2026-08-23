import { NextResponse } from "next/server";
import { z } from "zod";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { upsertMerchantRule } from "@/lib/categorize";
import { OTHER_CATEGORY, REVIEW_CATEGORY, REVIEW_QUEUE_CATEGORY_NAMES } from "@/lib/categories";
import { ensureDefaultFunds, fundFieldsForCategoryChange, fundIdForCategory } from "@/lib/funds";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/format";
import { parseLedger } from "@/lib/ledger";
import { ledgerSlugSchema, moveTransactionToLedger } from "@/lib/workspace-ledgers";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = parseLedger(searchParams.get("ledger"));
    const month = searchParams.get("month");
    const from = searchParams.get("from")?.trim() || null;
    const to = searchParams.get("to")?.trim() || null;
    const accountId = searchParams.get("accountId")?.trim() || null;
    const categoryId = searchParams.get("categoryId")?.trim() || null;
    const categoryName = searchParams.get("categoryName")?.trim() || null;
    const merchant = searchParams.get("merchant")?.trim() || null;
    const fundKind = searchParams.get("fundKind")?.trim() || searchParams.get("flexibility")?.trim() || null;
    const q = searchParams.get("q")?.trim();
    const take = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    const where: Record<string, unknown> = { workspaceId: workspace.id };
    if (ledger) {
      where.ledger = ledger;
    }
    if (from && to) {
      where.date = {
        gte: startOfDay(parseISO(from)),
        lte: endOfDay(parseISO(to)),
      };
    } else if (month) {
      const { start, end } = monthRange(month);
      where.date = { gte: start, lte: end };
    }
    if (accountId) {
      where.accountId = accountId;
    }
    const needsReview = searchParams.get("needsReview") === "1";
    if (needsReview) {
      where.isInvestment = false;
      where.OR = [
        { categoryId: null },
        { category: { name: { in: [...REVIEW_QUEUE_CATEGORY_NAMES] } } },
      ];
    } else if (categoryId === "none") {
      where.categoryId = null;
    } else if (categoryId === "review") {
      where.category = { name: REVIEW_CATEGORY };
    } else if (categoryId === "other") {
      where.category = { name: OTHER_CATEGORY };
    } else if (categoryId) {
      where.categoryId = categoryId;
    } else if (categoryName === "Uncategorized") {
      where.categoryId = null;
    } else if (categoryName) {
      where.category = { name: { equals: categoryName, mode: "insensitive" } };
    } else if (
      fundKind === "committed" ||
      fundKind === "flexible" ||
      fundKind === "reserve" ||
      fundKind === "fixed" ||
      fundKind === "discretionary"
    ) {
      const kind =
        fundKind === "fixed"
          ? "committed"
          : fundKind === "discretionary"
            ? "flexible"
            : fundKind;
      await ensureDefaultFunds(workspace.id);
      const funds = await prisma.fund.findMany({
        where: {
          workspaceId: workspace.id,
          ledger: "personal",
          kind: kind === "reserve" ? "reserve" : kind,
        },
        select: { id: true },
      });
      where.fundId = { in: funds.map((f) => f.id) };
    }
    if (merchant) {
      const exact = { equals: merchant, mode: "insensitive" as const };
      const merchantOr = [
        { merchantName: exact },
        {
          AND: [
            { OR: [{ merchantName: null }, { merchantName: "" }] },
            { name: exact },
          ],
        },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: merchantOr }];
        delete where.OR;
      } else if (where.AND) {
        (where.AND as unknown[]).push({ OR: merchantOr });
      } else {
        where.OR = merchantOr;
      }
    }
    if (q) {
      const contains = { contains: q, mode: "insensitive" as const };
      const textOr = [
        { name: contains },
        { merchantName: contains },
        { notes: contains },
        { category: { name: contains } },
        { account: { name: contains } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: textOr }];
        delete where.OR;
      } else if (where.AND) {
        (where.AND as unknown[]).push({ OR: textOr });
      } else {
        where.OR = textOr;
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        fund: { select: { id: true, name: true, slug: true, kind: true } },
        account: { select: { id: true, name: true, mask: true, type: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
    });

    return NextResponse.json({ transactions });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string(),
  categoryId: z.string().nullable().optional(),
  fundId: z.string().nullable().optional(),
  ledger: ledgerSlugSchema.optional(),
  notes: z.string().nullable().optional(),
  /** Persist a merchant → category rule and apply to past matches. */
  rememberMerchant: z.boolean().optional(),
  applyToPast: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.transaction.findFirst({
      where: { id: body.id, workspaceId: workspace.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextLedger = body.ledger ?? existing.ledger;

    if (body.ledger && body.ledger !== existing.ledger) {
      await moveTransactionToLedger({
        workspaceId: workspace.id,
        transactionId: existing.id,
        toLedger: body.ledger,
      });
    }

    if (body.categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: body.categoryId, workspaceId: workspace.id },
      });
      if (!cat) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
    }

    if (body.fundId) {
      const fund = await prisma.fund.findFirst({
        where: { id: body.fundId, workspaceId: workspace.id, ledger: nextLedger },
      });
      if (!fund || fund.kind === "buffer") {
        return NextResponse.json({ error: "Invalid fund" }, { status: 400 });
      }
    }

    const categoryChanging = body.categoryId !== undefined;
    const nextCategoryId =
      body.categoryId === undefined ? existing.categoryId : body.categoryId;

    let fundId: string | null | undefined = undefined;
    let fundSource: string | null | undefined = undefined;
    if (body.fundId !== undefined) {
      fundId = body.fundId;
      if (body.fundId && nextLedger) {
        const defaultId = await fundIdForCategory({
          workspaceId: workspace.id,
          ledger: nextLedger,
          categoryId: nextCategoryId,
        });
        fundSource = body.fundId === defaultId ? "category" : "user";
      } else {
        fundSource = null;
      }
    } else if (categoryChanging || body.ledger) {
      const fields = await fundFieldsForCategoryChange({
        workspaceId: workspace.id,
        ledger: nextLedger,
        categoryId: nextCategoryId,
        currentFundSource: existing.fundSource,
        currentFundId: existing.fundId,
      });
      if ("fundId" in fields) {
        fundId = fields.fundId;
        fundSource = fields.fundSource;
      }
    }

    const transaction = await prisma.transaction.update({
      where: { id: body.id },
      data: {
        categoryId: body.categoryId === undefined ? undefined : body.categoryId,
        categorySource: categoryChanging ? "user" : undefined,
        ledger: body.ledger,
        notes: body.notes === undefined ? undefined : body.notes,
        fundId,
        fundSource,
      },
      include: {
        category: true,
        fund: { select: { id: true, name: true, slug: true, kind: true } },
        account: true,
      },
    });

    let ruleApplied: { ruleId: string; applied: number } | null = null;
    if (
      body.rememberMerchant &&
      body.categoryId &&
      transaction.category?.name !== REVIEW_CATEGORY &&
      (transaction.merchantName || transaction.name)
    ) {
      ruleApplied = await upsertMerchantRule({
        workspaceId: workspace.id,
        ledger: body.ledger ?? transaction.ledger,
        merchantName: transaction.merchantName || transaction.name,
        categoryId: body.categoryId,
        applyToPast: body.applyToPast,
      });
      // Mark this tx as rule-sourced after creating the rule
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { categorySource: "rule" },
      });
      transaction.categorySource = "rule";
    }

    return NextResponse.json({ transaction, ruleApplied });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to update transaction" }, { status: 500 });
  }
}

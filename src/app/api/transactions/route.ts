import { NextResponse } from "next/server";
import { z } from "zod";
import { endOfDay, parseISO, startOfDay } from "date-fns";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { upsertMerchantRule } from "@/lib/categorize";
import {
  OTHER_CATEGORY,
  REVIEW_CATEGORY,
  REVIEW_QUEUE_CATEGORY_NAMES,
} from "@/lib/categories";
import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/format";
import type { Ledger } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = searchParams.get("ledger") as "personal" | "business" | null;
    const month = searchParams.get("month");
    const from = searchParams.get("from")?.trim() || null;
    const to = searchParams.get("to")?.trim() || null;
    const accountId = searchParams.get("accountId")?.trim() || null;
    const categoryId = searchParams.get("categoryId")?.trim() || null;
    const q = searchParams.get("q")?.trim();
    const take = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    const where: Record<string, unknown> = { workspaceId: workspace.id };
    if (ledger === "personal" || ledger === "business") {
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
    }
    if (q) {
      const textOr = [
        { name: { contains: q } },
        { merchantName: { contains: q } },
        { notes: { contains: q } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: textOr }];
        delete where.OR;
      } else {
        where.OR = textOr;
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
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
  ledger: z.enum(["personal", "business"]).optional(),
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

    if (body.categoryId) {
      const cat = await prisma.category.findFirst({
        where: { id: body.categoryId, workspaceId: workspace.id },
      });
      if (!cat) {
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      }
    }

    const categoryChanging = body.categoryId !== undefined;
    const transaction = await prisma.transaction.update({
      where: { id: body.id },
      data: {
        categoryId: body.categoryId === undefined ? undefined : body.categoryId,
        // Lock both assigned categories and intentional Uncategorized against sync.
        categorySource: categoryChanging ? "user" : undefined,
        ledger: body.ledger,
        notes: body.notes === undefined ? undefined : body.notes,
      },
      include: { category: true, account: true },
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
        ledger: (body.ledger ?? transaction.ledger) as Ledger,
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

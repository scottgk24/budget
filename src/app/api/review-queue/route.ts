import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import {
  AuthError,
  ensureMissingDefaultCategories,
  ensureUserAndWorkspace,
} from "@/lib/auth";
import {
  OTHER_CATEGORY,
  REVIEW_CATEGORY,
  REVIEW_QUEUE_CATEGORY_NAMES,
} from "@/lib/categories";
import { prisma } from "@/lib/db";

export type ReviewQueueReason = "review" | "uncategorized" | "other";

function reasonFor(categoryName: string | null | undefined): ReviewQueueReason {
  if (!categoryName) return "uncategorized";
  if (categoryName === REVIEW_CATEGORY) return "review";
  return "other";
}

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    await ensureMissingDefaultCategories(workspace.id);

    const { searchParams } = new URL(req.url);
    const ledger = searchParams.get("ledger") as "personal" | "business" | null;
    const take = Math.min(Number(searchParams.get("limit") ?? 12), 40);
    const since = subDays(new Date(), 90);
    const recentSince = subDays(new Date(), 30);
    const ledgerFilter =
      ledger === "personal" || ledger === "business" ? { ledger } : {};

    const base = {
      workspaceId: workspace.id,
      isInvestment: false,
      date: { gte: since },
      ...ledgerFilter,
    };

    const queueWhere = {
      ...base,
      OR: [
        { categoryId: null },
        { category: { name: { in: [...REVIEW_QUEUE_CATEGORY_NAMES] } } },
      ],
    };

    const recentWhere = {
      ...queueWhere,
      date: { gte: recentSince },
    };
    const olderWhere = {
      ...queueWhere,
      date: { gte: since, lt: recentSince },
    };

    const include = {
      category: { select: { id: true, name: true } },
      account: { select: { name: true, mask: true } },
    } as const;

    const [
      total,
      recentTotal,
      olderTotal,
      reviewCount,
      uncategorizedCount,
      otherCount,
      recentItems,
      olderItems,
    ] = await Promise.all([
      prisma.transaction.count({ where: queueWhere }),
      prisma.transaction.count({ where: recentWhere }),
      prisma.transaction.count({ where: olderWhere }),
      prisma.transaction.count({
        where: { ...base, category: { name: REVIEW_CATEGORY } },
      }),
      prisma.transaction.count({
        where: { ...base, categoryId: null },
      }),
      prisma.transaction.count({
        where: { ...base, category: { name: OTHER_CATEGORY } },
      }),
      prisma.transaction.findMany({
        where: recentWhere,
        include,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take,
      }),
      prisma.transaction.findMany({
        where: olderWhere,
        include,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take,
      }),
    ]);

    const mapItem = (tx: (typeof recentItems)[number]) => ({
        id: tx.id,
        name: tx.name,
        merchantName: tx.merchantName,
        amount: tx.amount,
        date: tx.date,
        pending: tx.pending,
        ledger: tx.ledger,
        reason: reasonFor(tx.category?.name),
        category: tx.category,
        account: tx.account,
      });

    return NextResponse.json({
      total,
      recentTotal,
      olderTotal,
      olderCutoffDays: 30,
      counts: {
        review: reviewCount,
        uncategorized: uncategorizedCount,
        other: otherCount,
      },
      items: recentItems.map(mapItem),
      olderItems: olderItems.map(mapItem),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Failed to load review queue" },
      { status: 500 },
    );
  }
}

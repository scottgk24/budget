import { endOfMonth, subMonths } from "date-fns";
import { NextResponse } from "next/server";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { excludeNonSpendCategory } from "@/lib/categories";
import { prisma } from "@/lib/db";
import { detectRecurring, upcomingRecurringTotal } from "@/lib/recurring";
import { monthKey, monthRange } from "@/lib/format";
import type { Ledger } from "@/lib/types";

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as Ledger) || "personal";
    const month = searchParams.get("month") || monthKey();
    const { end } = monthRange(month);
    const lookbackStart = subMonths(end, 14);

    const txs = await prisma.transaction.findMany({
      where: {
        workspaceId: workspace.id,
        ledger,
        pending: false,
        date: { gte: lookbackStart, lte: end },
        ...excludeNonSpendCategory,
        amount: { gt: 0 },
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { date: "asc" },
    });

    const items = detectRecurring(
      txs.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        date: tx.date,
        name: tx.name,
        merchantName: tx.merchantName,
        categoryId: tx.categoryId,
        categoryName: tx.category?.name ?? null,
      })),
    );

    const { start: monthStart } = monthRange(month);
    const monthEnd = endOfMonth(new Date(`${month}-01T12:00:00`));
    const upcomingThisMonth = upcomingRecurringTotal(items, monthEnd, monthStart);
    const subscriptions = items.filter((i) => i.isSubscription);
    const bills = items.filter((i) => !i.isSubscription);

    const monthlyEstimate =
      Math.round(
        items.reduce((sum, item) => {
          switch (item.cadence) {
            case "weekly":
              return sum + item.averageAmount * (52 / 12);
            case "biweekly":
              return sum + item.averageAmount * (26 / 12);
            case "monthly":
              return sum + item.averageAmount;
            case "quarterly":
              return sum + item.averageAmount / 3;
            case "yearly":
              return sum + item.averageAmount / 12;
            default:
              return sum;
          }
        }, 0) * 100,
      ) / 100;

    return NextResponse.json({
      ledger,
      month,
      items,
      subscriptions,
      bills,
      totals: {
        monthlyEstimate,
        upcomingThisMonth,
        subscriptionCount: subscriptions.length,
        billCount: bills.length,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("recurring", err);
    return NextResponse.json({ error: "Failed to load recurring" }, { status: 500 });
  }
}

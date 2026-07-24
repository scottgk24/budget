import { NextResponse } from "next/server";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { isIncomeAmount, isSpendAmount } from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  type MetricsGranularity,
  periodBounds,
} from "@/lib/format";

function parseGranularity(raw: string | null): MetricsGranularity | null {
  if (raw === "daily" || raw === "weekly" || raw === "monthly" || raw === "yearly") {
    return raw;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledger = (searchParams.get("ledger") as "personal" | "business") || "personal";
    const granularity = parseGranularity(searchParams.get("granularity"));
    const key = searchParams.get("key")?.trim();

    if (!granularity || !key) {
      return NextResponse.json(
        { error: "granularity and key are required" },
        { status: 400 },
      );
    }

    let bounds: { start: Date; end: Date; label: string };
    try {
      bounds = periodBounds(key, granularity);
    } catch {
      return NextResponse.json({ error: "Invalid period key" }, { status: 400 });
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        workspaceId: workspace.id,
        ledger,
        date: { gte: bounds.start, lte: bounds.end },
        pending: false,
      },
      select: {
        amount: true,
        categoryId: true,
        category: { select: { id: true, name: true } },
      },
    });

    type CatRow = {
      categoryId: string | null;
      name: string;
      spend: number;
      income: number;
      count: number;
    };

    const byCategory = new Map<string, CatRow>();
    let spend = 0;
    let income = 0;

    for (const tx of transactions) {
      const name = tx.category?.name ?? "Uncategorized";
      const mapKey = tx.categoryId ?? "none";
      let row = byCategory.get(mapKey);
      if (!row) {
        row = {
          categoryId: tx.categoryId,
          name,
          spend: 0,
          income: 0,
          count: 0,
        };
        byCategory.set(mapKey, row);
      }
      row.count += 1;

      if (isSpendAmount(tx.amount, tx.category?.name)) {
        row.spend += tx.amount;
        spend += tx.amount;
      } else if (isIncomeAmount(tx.amount, tx.category?.name)) {
        const abs = Math.abs(tx.amount);
        row.income += abs;
        income += abs;
      }
    }

    const categories = [...byCategory.values()].sort((a, b) => {
      const aTotal = a.spend + a.income;
      const bTotal = b.spend + b.income;
      return bTotal - aTotal;
    });

    return NextResponse.json({
      ledger,
      granularity,
      key,
      label: bounds.label,
      start: bounds.start.toISOString(),
      end: bounds.end.toISOString(),
      spend,
      income,
      savings: income - spend,
      transactionCount: transactions.length,
      categories,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("metrics/period", err);
    return NextResponse.json({ error: "Failed to load period breakdown" }, { status: 500 });
  }
}

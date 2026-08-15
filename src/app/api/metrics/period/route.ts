import { NextResponse } from "next/server";
import { endOfDay, format, parseISO, startOfDay } from "date-fns";
import { AuthError, ensureUserAndWorkspace } from "@/lib/auth";
import { isIncomeAmount, isSpendAmount, defaultFundSlugForCategoryName, fundKindForSlug } from "@/lib/categories";
import { prisma } from "@/lib/db";
import {
  type MetricsGranularity,
  periodBounds,
  toDateParam,
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
    const fromParam = searchParams.get("from")?.trim();
    const toParam = searchParams.get("to")?.trim();
    const fundKindFilter = searchParams.get("fundKind")?.trim() || searchParams.get("flexibility")?.trim();

    let bounds: { start: Date; end: Date; label: string };
    let resolvedKey: string | null = key ?? null;
    let resolvedGranularity: MetricsGranularity | null = granularity;

    if (fromParam && toParam) {
      try {
        const start = startOfDay(parseISO(fromParam));
        const end = endOfDay(parseISO(toParam));
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
          return NextResponse.json({ error: "Invalid from/to range" }, { status: 400 });
        }
        const sameDay = toDateParam(start) === toDateParam(end);
        bounds = {
          start,
          end,
          label: sameDay
            ? format(start, "MMM d, yyyy")
            : `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`,
        };
      } catch {
        return NextResponse.json({ error: "Invalid from/to range" }, { status: 400 });
      }
    } else if (granularity && key) {
      try {
        bounds = periodBounds(key, granularity);
      } catch {
        return NextResponse.json({ error: "Invalid period key" }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { error: "Provide granularity+key or from+to" },
        { status: 400 },
      );
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
        fund: { select: { kind: true, slug: true } },
      },
    });

    type CatRow = {
      categoryId: string | null;
      name: string;
      spend: number;
      income: number;
      count: number;
      fundKind: "committed" | "flexible" | "reserve" | null;
      flexibility: "fixed" | "discretionary" | null;
    };

    const byCategory = new Map<string, CatRow>();
    let spend = 0;
    let income = 0;
    let fixedSpend = 0;
    let discretionarySpend = 0;
    let reserveSpend = 0;

    for (const tx of transactions) {
      const name = tx.category?.name ?? "Uncategorized";
      const mapKey = tx.categoryId ?? "none";
      const kind =
        ledger === "personal"
          ? ((tx.fund?.kind as "committed" | "flexible" | "reserve" | undefined) ??
            fundKindForSlug(defaultFundSlugForCategoryName(name)) ??
            "flexible")
          : null;
      let row = byCategory.get(mapKey);
      if (!row) {
        row = {
          categoryId: tx.categoryId,
          name,
          spend: 0,
          income: 0,
          count: 0,
          fundKind: kind === "buffer" ? "flexible" : kind,
          flexibility:
            kind === "committed" ? "fixed" : kind === "flexible" ? "discretionary" : null,
        };
        byCategory.set(mapKey, row);
      }
      row.count += 1;

      if (isSpendAmount(tx.amount, tx.category?.name)) {
        row.spend += tx.amount;
        spend += tx.amount;
        if (ledger === "personal") {
          if (kind === "committed") fixedSpend += tx.amount;
          else if (kind === "reserve") reserveSpend += tx.amount;
          else discretionarySpend += tx.amount;
        }
      } else if (isIncomeAmount(tx.amount, tx.category?.name)) {
        const abs = Math.abs(tx.amount);
        row.income += abs;
        income += abs;
      }
    }

    let categories = [...byCategory.values()].sort((a, b) => {
      const aTotal = a.spend + a.income;
      const bTotal = b.spend + b.income;
      return bTotal - aTotal;
    });

    const normalizedFilter =
      fundKindFilter === "fixed"
        ? "committed"
        : fundKindFilter === "discretionary"
          ? "flexible"
          : fundKindFilter;

    if (
      normalizedFilter === "committed" ||
      normalizedFilter === "flexible" ||
      normalizedFilter === "reserve"
    ) {
      categories = categories.filter((c) => c.fundKind === normalizedFilter);
      spend =
        normalizedFilter === "committed"
          ? fixedSpend
          : normalizedFilter === "reserve"
            ? reserveSpend
            : discretionarySpend;
      income = categories.reduce((sum, c) => sum + c.income, 0);
    }

    const transactionCount = categories.reduce((sum, c) => sum + c.count, 0);

    return NextResponse.json({
      ledger,
      granularity: resolvedGranularity,
      key: resolvedKey,
      label: bounds.label,
      start: bounds.start.toISOString(),
      end: bounds.end.toISOString(),
      spend,
      fixedSpend: ledger === "personal" ? fixedSpend : null,
      discretionarySpend: ledger === "personal" ? discretionarySpend : null,
      reserveSpend: ledger === "personal" ? reserveSpend : null,
      income,
      savings: income - spend,
      transactionCount,
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

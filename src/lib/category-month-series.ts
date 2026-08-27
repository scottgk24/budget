import { format } from "date-fns";
import {
  defaultFundSlugForCategoryName,
  fundKindForSlug,
  isSpendAmount,
  NON_SPEND_CATEGORIES,
} from "@/lib/categories";
import {
  formatMonthLabel,
  monthlyAllotment,
  yearFromPeriod,
} from "@/lib/format";

export type MonthKey = string;

export type CategoryMonthPoint = {
  month: MonthKey;
  label: string;
  spent: number;
  budget: number;
};

export type CategoryMonthSeries = {
  categoryId: string;
  name: string;
  budgetPeriod: "monthly" | "annual";
  points: CategoryMonthPoint[];
};

export type CategoryMonthSeriesRegistry = {
  months: MonthKey[];
  byCategoryId: Record<string, CategoryMonthSeries>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function isFlexibleCategoryName(name: string): boolean {
  const kind = fundKindForSlug(defaultFundSlugForCategoryName(name));
  return kind === "flexible" || kind == null;
}

function allotmentForMonth(
  budgetPeriod: "monthly" | "annual",
  categoryId: string,
  month: string,
  budgetIndex: Map<string, number>,
): number {
  if (budgetPeriod === "annual") {
    const year = yearFromPeriod(month);
    const annual = budgetIndex.get(`${categoryId}:${year}`);
    return annual != null ? monthlyAllotment(annual) : 0;
  }
  return budgetIndex.get(`${categoryId}:${month}`) ?? 0;
}

export function buildCategoryMonthSeries(params: {
  months: string[];
  categories: Array<{ id: string; name: string; budgetPeriod: string }>;
  transactions: Array<{
    date: Date;
    amount: number;
    categoryId: string | null;
    categoryName?: string | null;
  }>;
  budgets: Array<{ categoryId: string; month: string; amount: number }>;
}): CategoryMonthSeriesRegistry {
  const { months } = params;
  const budgetIndex = new Map<string, number>();
  for (const b of params.budgets) {
    budgetIndex.set(`${b.categoryId}:${b.month}`, b.amount);
  }

  const byCategoryId: Record<string, CategoryMonthSeries> = {};

  const spendCategories = params.categories.filter(
    (c) => !(NON_SPEND_CATEGORIES as readonly string[]).includes(c.name),
  );

  for (const cat of spendCategories) {
    const budgetPeriod: "monthly" | "annual" =
      cat.budgetPeriod === "annual" ? "annual" : "monthly";
    byCategoryId[cat.id] = {
      categoryId: cat.id,
      name: cat.name,
      budgetPeriod,
      points: months.map((month) => ({
        month,
        label: formatMonthLabel(month),
        spent: 0,
        budget: round2(allotmentForMonth(budgetPeriod, cat.id, month, budgetIndex)),
      })),
    };
  }

  const hasUncategorized = params.transactions.some((tx) => tx.categoryId == null);
  if (hasUncategorized) {
    byCategoryId.uncategorized = {
      categoryId: "uncategorized",
      name: "Uncategorized",
      budgetPeriod: "monthly",
      points: months.map((month) => ({
        month,
        label: formatMonthLabel(month),
        spent: 0,
        budget: 0,
      })),
    };
  }

  const monthIndex = new Map(months.map((m, i) => [m, i]));

  for (const tx of params.transactions) {
    if (!isSpendAmount(tx.amount, tx.categoryName)) continue;
    const id = tx.categoryId ?? "uncategorized";
    const series = byCategoryId[id];
    if (!series) continue;
    const key = format(tx.date, "yyyy-MM");
    const idx = monthIndex.get(key);
    if (idx == null) continue;
    const point = series.points[idx]!;
    point.spent = round2(point.spent + tx.amount);
  }

  return { months, byCategoryId };
}

export function toStackedSpendRows(
  registry: CategoryMonthSeriesRegistry,
  opts: {
    topN?: number;
    include?: (s: CategoryMonthSeries) => boolean;
  } = {},
): {
  months: Array<Record<string, string | number>>;
  keys: string[];
} {
  const topN = opts.topN ?? 8;
  const seriesList = Object.values(registry.byCategoryId).filter(
    opts.include ?? (() => true),
  );

  const ranked = [...seriesList]
    .map((s) => ({
      name: s.name,
      total: s.points.reduce((sum, p) => sum + p.spent, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const topNames = ranked.slice(0, topN).map((r) => r.name);
  const topSet = new Set(topNames);
  // Distinct from the real category named Other.
  const STACKED_REMAINDER = "All other";

  const rows = registry.months.map((m, i) => {
    const row: Record<string, string | number> = {
      key: m,
      label: format(new Date(`${m}-01T12:00:00`), "MMM yy"),
    };
    let other = 0;
    for (const s of seriesList) {
      const spent = s.points[i]?.spent ?? 0;
      if (topSet.has(s.name)) {
        row[s.name] = round2(
          (typeof row[s.name] === "number" ? (row[s.name] as number) : 0) + spent,
        );
      } else {
        other += spent;
      }
    }
    for (const name of topNames) {
      if (row[name] == null) row[name] = 0;
    }
    row[STACKED_REMAINDER] = round2(other);
    return row;
  });

  const hasOther = rows.some(
    (r) =>
      typeof r[STACKED_REMAINDER] === "number" &&
      (r[STACKED_REMAINDER] as number) !== 0,
  );
  const keys = hasOther ? [...topNames, STACKED_REMAINDER] : [...topNames];
  if (!hasOther) {
    for (const row of rows) {
      delete row[STACKED_REMAINDER];
    }
  }

  return { months: rows, keys };
}

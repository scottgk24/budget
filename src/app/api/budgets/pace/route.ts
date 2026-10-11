import { NextResponse } from "next/server";
import {
  AuthError,
  ensureMissingDefaultCategories,
  ensureUserAndWorkspace,
} from "@/lib/auth";
import {
  defaultFundSlugForCategoryName,
  fundKindForSlug,
  isAnnualBudgetPeriod,
  type FundKind,
} from "@/lib/categories";
import {
  indexMonthlyBudgets,
  standingMonthlyAmount,
} from "@/lib/budget-amount";
import { computeFundMonth, ensureDefaultFunds } from "@/lib/funds";
import { prisma } from "@/lib/db";
import { monthlyAllotment, monthKey, yearFromPeriod } from "@/lib/format";
import { parseLedger } from "@/lib/ledger";
import { buildSpendPace } from "@/lib/reports";
import { isPersonalLedger, ledgerSlugSchema } from "@/lib/workspace-ledgers";

const SKIP = new Set(["Income", "Transfers", "Review"]);
type FundScope = "all" | "flexible" | "committed";

const round2 = (n: number) => Math.round(n * 100) / 100;

function parseFundScope(raw: string | null): FundScope {
  if (raw === "flexible" || raw === "committed" || raw === "all") return raw;
  return "all";
}

/**
 * Current-month on-track pace for Budgets: cumulative actual vs ideal burn.
 * Filters: category (all | id) and fund scope (all | flexible | committed).
 */
export async function GET(req: Request) {
  try {
    const { workspace } = await ensureUserAndWorkspace();
    const { searchParams } = new URL(req.url);
    const ledgerRaw = searchParams.get("ledger") ?? "personal";
    const ledgerParsed = ledgerSlugSchema.safeParse(ledgerRaw);
    if (!ledgerParsed.success) {
      return NextResponse.json({ error: "Invalid ledger" }, { status: 400 });
    }
    const ledger = parseLedger(ledgerRaw) ?? "personal";
    const isPersonal = await isPersonalLedger(workspace.id, ledger);
    const month = searchParams.get("month") || monthKey();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Invalid month" }, { status: 400 });
    }
    const year = yearFromPeriod(month);
    const categoryIdParam = searchParams.get("categoryId") || "all";
    const fundScope = isPersonal ? parseFundScope(searchParams.get("fundKind")) : "all";

    await ensureMissingDefaultCategories(workspace.id);
    if (isPersonal) {
      await ensureDefaultFunds(workspace.id);
    }

    const [categories, allBudgets, funds, fundPlan] = await Promise.all([
      prisma.category.findMany({
        where: { workspaceId: workspace.id, ledger },
        orderBy: { name: "asc" },
      }),
      prisma.budget.findMany({
        where: { workspaceId: workspace.id, ledger },
      }),
      isPersonal
        ? prisma.fund.findMany({
            where: { workspaceId: workspace.id, ledger: "personal" },
          })
        : Promise.resolve([]),
      isPersonal
        ? computeFundMonth({ workspaceId: workspace.id, month })
        : Promise.resolve(null),
    ]);

    const monthlyIndex = indexMonthlyBudgets(allBudgets);

    function budgetAmountFor(cat: { id: string; budgetPeriod: string }): number {
      if (isAnnualBudgetPeriod(cat.budgetPeriod)) {
        const row = allBudgets.find((b) => b.categoryId === cat.id && b.month === year);
        return row?.amount ?? 0;
      }
      const exact = allBudgets.find((b) => b.categoryId === cat.id && b.month === month);
      if (exact) return exact.amount;
      return standingMonthlyAmount(monthlyIndex.get(cat.id), month);
    }

    function monthlyBudgetFor(cat: { id: string; budgetPeriod: string }): number {
      const amt = budgetAmountFor(cat);
      return isAnnualBudgetPeriod(cat.budgetPeriod) ? monthlyAllotment(amt) : amt;
    }

    function categoryFundKind(cat: {
      id: string;
      name: string;
      defaultFundId: string | null;
    }): FundKind | null {
      const fund = funds.find((f) => f.id === cat.defaultFundId);
      if (
        fund?.kind === "committed" ||
        fund?.kind === "flexible" ||
        fund?.kind === "reserve"
      ) {
        return fund.kind;
      }
      if (fund?.kind === "buffer") return null;
      return fundKindForSlug(defaultFundSlugForCategoryName(cat.name));
    }

    const rows = categories.filter((c) => !SKIP.has(c.name));
    let scoped = rows;
    if (isPersonal && fundScope !== "all") {
      scoped = rows.filter((c) => categoryFundKind(c) === fundScope);
    }

    const category =
      categoryIdParam !== "all"
        ? scoped.find((c) => c.id === categoryIdParam) ?? null
        : null;

    // Invalid category for current fund scope → treat as all in scope
    const effectiveCategoryId = category?.id ?? "all";

    let budgetTotal = 0;
    if (effectiveCategoryId !== "all" && category) {
      budgetTotal = monthlyBudgetFor(category);
    } else if (isPersonal && fundScope === "flexible" && fundPlan) {
      budgetTotal = Math.max(0, fundPlan.flexibleAssigned - fundPlan.carriedOverspend);
    } else if (isPersonal && fundScope === "committed" && fundPlan) {
      budgetTotal = fundPlan.committedNeed;
    } else if (isPersonal && fundScope !== "all") {
      budgetTotal = round2(scoped.reduce((sum, c) => sum + monthlyBudgetFor(c), 0));
    } else {
      budgetTotal = round2(rows.reduce((sum, c) => sum + monthlyBudgetFor(c), 0));
    }

    // Single category → id filter. Fund scope alone → fundKind (matches Dashboard).
    const categoryIds =
      effectiveCategoryId !== "all" ? [effectiveCategoryId] : null;
    const paceFundKind: "all" | "flexible" | "committed" =
      effectiveCategoryId !== "all" ? "all" : fundScope;

    const spendPace = await buildSpendPace({
      workspaceId: workspace.id,
      ledger,
      month,
      budgetTotal,
      spentToDate: 0,
      fundKind: paceFundKind,
      categoryIds,
    });

    const spentToDate =
      [...spendPace.series].reverse().find((p) => p.actual != null)?.actual ?? 0;
    spendPace.spentToDate = spentToDate;
    spendPace.freeToSpend =
      budgetTotal > 0 ? round2(budgetTotal - spentToDate) : null;
    spendPace.paceDelta =
      spendPace.idealToDate > 0 || spentToDate > 0
        ? round2(spendPace.idealToDate - spentToDate)
        : null;

    if (
      isPersonal &&
      fundScope === "flexible" &&
      effectiveCategoryId === "all" &&
      fundPlan
    ) {
      const flexibleLeft = round2(
        fundPlan.flexibleAssigned - fundPlan.carriedOverspend - fundPlan.flexibleSpent,
      );
      spendPace.freeToSpend = Math.max(0, flexibleLeft);
    }

    return NextResponse.json({
      month,
      ledger,
      fundKind: fundScope,
      categoryId: effectiveCategoryId,
      budgetTotal,
      spendPace,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Failed to load budget pace" }, { status: 500 });
  }
}

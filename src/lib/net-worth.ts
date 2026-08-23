import { format, subMonths } from "date-fns";
import { signedAccountBalance } from "@/lib/accounts";
import { prisma } from "@/lib/db";
import { isCurrencyHolding, normalizeHoldings } from "@/lib/holdings";
import type { Ledger } from "@/lib/types";

export const WEALTH_CLASSES = [
  "cash",
  "investments",
  "other_asset",
  "credit",
  "loan",
] as const;

export type WealthClass = (typeof WEALTH_CLASSES)[number];

export const HOLDING_KINDS = [
  "cash",
  "equity",
  "fixed_income",
  "crypto",
  "other",
] as const;

export type HoldingKind = (typeof HOLDING_KINDS)[number];

export type NetWorthAccountRow = {
  id: string;
  name: string;
  mask: string | null;
  type: string;
  subtype: string | null;
  wealthClass: WealthClass;
  signedBalance: number;
  isManual: boolean;
  holdingCount: number;
};

export type NetWorthHoldingRow = {
  id: string;
  accountId: string;
  accountName: string;
  name: string;
  symbol: string | null;
  quantity: number;
  price: number | null;
  value: number;
  costBasis: number | null;
  gain: number | null;
  gainPct: number | null;
  kind: HoldingKind;
};

export type AllocationSlice = {
  key: string;
  label: string;
  value: number;
};

export type NetWorthHistoryPoint = {
  date: string;
  label: string;
  assets: number;
  liabilities: number;
  net: number;
};

export type NetWorthView = {
  asOf: string;
  assets: number;
  liabilities: number;
  net: number;
  byClass: AllocationSlice[];
  byHoldingKind: AllocationSlice[];
  accounts: NetWorthAccountRow[];
  holdings: NetWorthHoldingRow[];
  history: NetWorthHistoryPoint[];
};

const CLASS_LABEL: Record<WealthClass, string> = {
  cash: "Cash",
  investments: "Investments",
  other_asset: "Other assets",
  credit: "Credit cards",
  loan: "Loans",
};

const KIND_LABEL: Record<HoldingKind, string> = {
  cash: "Cash",
  equity: "Equity",
  fixed_income: "Fixed income",
  crypto: "Crypto",
  other: "Other",
};

const BOND_TICKERS = new Set([
  "BND",
  "BNDX",
  "AGG",
  "TLT",
  "IEF",
  "SHY",
  "VCIT",
  "VCSH",
  "LQD",
  "HYG",
  "JNK",
  "VTIP",
  "SGOV",
  "BIL",
]);

const CRYPTO_TICKERS = new Set(["BTC", "ETH", "SOL", "BTCUSD", "ETHUSD"]);

export function classifyWealthClass(type: string, subtype: string | null): WealthClass {
  const t = type.toLowerCase();
  const s = (subtype ?? "").toLowerCase();
  if (t === "depository") return "cash";
  if (t === "investment" || t === "brokerage") return "investments";
  if (t === "credit") return "credit";
  if (t === "loan") return "loan";
  if (s.includes("mortgage") || s.includes("auto") || s.includes("student")) {
    return "loan";
  }
  return "other_asset";
}

export function classifyHoldingKind(input: {
  symbol: string | null;
  name: string;
}): HoldingKind {
  if (isCurrencyHolding(input)) return "cash";
  const symbol = (input.symbol ?? "").toUpperCase().replace(/^CUR:/, "");
  const name = input.name.toLowerCase();
  if (
    CRYPTO_TICKERS.has(symbol) ||
    name.includes("bitcoin") ||
    name.includes("ethereum")
  ) {
    return "crypto";
  }
  if (
    BOND_TICKERS.has(symbol) ||
    name.includes("bond") ||
    name.includes("treasury") ||
    name.includes("fixed income")
  ) {
    return "fixed_income";
  }
  if (
    name.includes("etf") ||
    name.includes("stock") ||
    name.includes("equity") ||
    symbol.length > 0
  ) {
    return "equity";
  }
  return "other";
}

function todayKey(now = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

function historyLabel(date: string): string {
  const [y, m] = date.split("-");
  if (!y || !m) return date;
  return format(new Date(Number(y), Number(m) - 1, 1), "MMM yyyy");
}

export function totalsFromAccounts(
  accounts: Array<{ type: string; currentBalance: number | null }>,
): { assets: number; liabilities: number; net: number } {
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    const signed = signedAccountBalance(a.type, a.currentBalance);
    if (signed >= 0) assets += signed;
    else liabilities += Math.abs(signed);
  }
  return { assets, liabilities, net: assets - liabilities };
}

export async function buildNetWorthView(opts: {
  workspaceId: string;
  ledger: Ledger;
}): Promise<NetWorthView> {
  const accounts = await prisma.account.findMany({
    where: {
      workspaceId: opts.workspaceId,
      ledger: opts.ledger,
      isHidden: false,
    },
    include: { holdings: true },
    orderBy: { name: "asc" },
  });

  const totals = totalsFromAccounts(accounts);
  const classTotals = new Map<WealthClass, number>();
  for (const cls of WEALTH_CLASSES) classTotals.set(cls, 0);

  const accountRows: NetWorthAccountRow[] = accounts.map((a) => {
    const wealthClass = classifyWealthClass(a.type, a.subtype);
    const signedBalance = signedAccountBalance(a.type, a.currentBalance);
    classTotals.set(
      wealthClass,
      (classTotals.get(wealthClass) ?? 0) + Math.abs(signedBalance),
    );
    return {
      id: a.id,
      name: a.name,
      mask: a.mask,
      type: a.type,
      subtype: a.subtype,
      wealthClass,
      signedBalance,
      isManual: !a.plaidItemId,
      holdingCount: a.holdings.length,
    };
  });

  const flatHoldings = accounts.flatMap((a) =>
    a.holdings.map((h) => ({
      id: h.id,
      name: h.name,
      symbol: h.symbol,
      value: h.value,
      quantity: h.quantity,
      accountId: h.accountId,
      isoCurrencyCode: h.isoCurrencyCode,
      price: h.price,
      costBasis: h.costBasis,
      accountName: a.name,
    })),
  );

  const holdings: NetWorthHoldingRow[] = normalizeHoldings(flatHoldings).map((h) => {
    const value = h.value ?? 0;
    const cost = h.costBasis;
    const gain = cost != null ? value - cost : null;
    const gainPct =
      gain != null && cost && Math.abs(cost) > 0.01 ? (gain / cost) * 100 : null;
    return {
      id: h.id,
      accountId: h.accountId ?? "",
      accountName: h.accountName,
      name: h.name,
      symbol: h.symbol,
      quantity: h.quantity,
      price: h.price,
      value,
      costBasis: cost,
      gain,
      gainPct,
      kind: classifyHoldingKind(h),
    };
  });

  const kindTotals = new Map<HoldingKind, number>();
  for (const h of holdings) {
    kindTotals.set(h.kind, (kindTotals.get(h.kind) ?? 0) + h.value);
  }

  const asOf = todayKey();
  const snapshots = await prisma.netWorthSnapshot.findMany({
    where: {
      workspaceId: opts.workspaceId,
      ledger: opts.ledger,
      date: { gte: format(subMonths(new Date(), 18), "yyyy-MM-dd") },
    },
    orderBy: { date: "asc" },
  });

  const history: NetWorthHistoryPoint[] = snapshots.map((s) => ({
    date: s.date,
    label: historyLabel(s.date),
    assets: s.assets,
    liabilities: s.liabilities,
    net: s.net,
  }));

  const last = history[history.length - 1];
  if (!last || last.date !== asOf) {
    history.push({
      date: asOf,
      label: historyLabel(asOf),
      assets: totals.assets,
      liabilities: totals.liabilities,
      net: totals.net,
    });
  } else {
    last.assets = totals.assets;
    last.liabilities = totals.liabilities;
    last.net = totals.net;
  }

  return {
    asOf,
    assets: totals.assets,
    liabilities: totals.liabilities,
    net: totals.net,
    byClass: WEALTH_CLASSES.map((key) => ({
      key,
      label: CLASS_LABEL[key],
      value: classTotals.get(key) ?? 0,
    })).filter((s) => s.value > 0.005),
    byHoldingKind: HOLDING_KINDS.map((key) => ({
      key,
      label: KIND_LABEL[key],
      value: kindTotals.get(key) ?? 0,
    })).filter((s) => s.value > 0.005),
    accounts: accountRows.sort(
      (a, b) => Math.abs(b.signedBalance) - Math.abs(a.signedBalance),
    ),
    holdings,
    history,
  };
}

export async function captureNetWorthSnapshots(workspaceId: string, now = new Date()) {
  const date = todayKey(now);
  const { ensureWorkspaceLedgers } = await import("@/lib/workspace-ledgers");
  const ledgers = await ensureWorkspaceLedgers(workspaceId);
  for (const row of ledgers) {
    const ledger = row.slug;
    const accounts = await prisma.account.findMany({
      where: { workspaceId, ledger, isHidden: false },
      select: { type: true, currentBalance: true },
    });
    if (accounts.length === 0) continue;
    const totals = totalsFromAccounts(accounts);
    await prisma.netWorthSnapshot.upsert({
      where: {
        workspaceId_ledger_date: { workspaceId, ledger, date },
      },
      create: {
        workspaceId,
        ledger,
        date,
        assets: totals.assets,
        liabilities: totals.liabilities,
        net: totals.net,
      },
      update: {
        assets: totals.assets,
        liabilities: totals.liabilities,
        net: totals.net,
      },
    });
  }
}

export const MANUAL_KINDS = [
  "cash",
  "investment",
  "property",
  "vehicle",
  "other_asset",
  "credit",
  "loan",
] as const;

export type ManualKind = (typeof MANUAL_KINDS)[number];

export function accountFieldsForManualKind(kind: ManualKind): {
  type: string;
  subtype: string;
} {
  switch (kind) {
    case "cash":
      return { type: "depository", subtype: "savings" };
    case "investment":
      return { type: "investment", subtype: "brokerage" };
    case "property":
      return { type: "other", subtype: "real estate" };
    case "vehicle":
      return { type: "other", subtype: "vehicle" };
    case "other_asset":
      return { type: "other", subtype: "other" };
    case "credit":
      return { type: "credit", subtype: "credit card" };
    case "loan":
      return { type: "loan", subtype: "loan" };
  }
}

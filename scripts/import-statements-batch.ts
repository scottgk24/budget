/**
 * Import RobinHoodCC2026.csv + Chase activity CSVs.
 * Skips rows that already exist from Plaid (same account, date, amount).
 * Classifies Porchlight business expenses on RH.
 *
 * Usage: npx tsx scripts/import-statements-batch.ts [--apply]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash } from "crypto";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { loadCategoryRules, matchRuleCategoryId } from "../src/lib/categorize";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const ACCOUNTS = {
  rh2923: "cmryf3p0i00084wgl3d85s8z9",
  chase2594: "cmryb46w70005d02xtozh6h9b",
  chase9730: "cmryb46wg0009d02xyqt3a3hj",
  chase6771: "cmryb46wc0007d02xjteh5k56",
} as const;

type ExistingTx = {
  id: string;
  date: Date;
  amount: number;
  name: string;
  ledger: string;
  categoryId: string | null;
  categorySource: string | null;
  plaidTransactionId: string | null;
  used: boolean;
};

type ImportRow = {
  accountId: string;
  date: Date;
  amount: number; // Plaid convention
  name: string;
  merchantName: string | null;
  pending: boolean;
  exportKey: string;
  source: string;
  type: string;
  cardholder?: string;
};

type SheetRow = {
  merchant: string;
  date: Date;
  amount: number;
  item: string;
  mappedCat: string;
};

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  function parseRow(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  const headers = parseRow(lines[0]).map((h) => h.replace(/^\uFEFF/, "").trim());
  return lines.slice(1).map((line) => {
    const cols = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cols[i] ?? "").trim();
    });
    return row;
  });
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseChaseDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2])));
}

function parseSheetDate(s: string): Date | null {
  const raw = (s || "").trim();
  if (!raw) return null;
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2])));
  }
  m = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s*(\d{4})$/);
  if (m) {
    const months: Record<string, number> = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    };
    const mi = months[m[1].toLowerCase()];
    if (mi == null) return null;
    return new Date(Date.UTC(Number(m[3]), mi, Number(m[2])));
  }
  return null;
}

function parseMoney(s: string): number | null {
  const t = (s || "").replace(/[$,\s]/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

function hashKey(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

function normalizeMerchant(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|com|www|refund)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function merchantScore(sheetMerchant: string, rhMerchant: string, rhDescription: string): number {
  const a = normalizeMerchant(sheetMerchant);
  const b = normalizeMerchant(`${rhMerchant} ${rhDescription}`);
  if (!a || !b) return 0;
  if (b.includes(a) || a.includes(b)) return 10;
  const aliases: Array<[RegExp, RegExp]> = [
    [/facebook/i, /facebk|facebook/i],
    [/adobe/i, /adobe/i],
    [/amazon/i, /amazon|amzn/i],
    [/hobby lobby/i, /hobby/i],
    [/etsy/i, /etsy/i],
    [/kate/i, /kate|backdrop/i],
    [/hello little/i, /hello little/i],
    [/luneberry/i, /luneberry/i],
    [/once upon/i, /once upon/i],
    [/porkbun/i, /porkbun/i],
    [/backblaze/i, /backblaze/i],
    [/google/i, /google|gsuite|workspace/i],
    [/little glass/i, /glass shack|little glass/i],
  ];
  for (const [sm, rm] of aliases) {
    if (sm.test(sheetMerchant) && rm.test(b)) return 9;
  }
  const tokens = a.split(" ").filter((t) => t.length >= 3);
  let hits = 0;
  for (const t of tokens) if (b.includes(t)) hits++;
  if (tokens.length && hits === tokens.length) return 8;
  if (hits > 0) return 3 + hits;
  return 0;
}

function mapSheetCategory(sheetCat: string, merchant: string, item: string): string {
  const c = (sheetCat || "").trim().toLowerCase();
  const hay = `${merchant} ${item}`.toLowerCase();
  if (c === "ads") return "Marketing";
  if (c === "supplies") return "Supplies";
  if (c === "large assets") return "Other";
  if (c === "misc") {
    if (/adobe|pic-time|honeybook|subscription|software/.test(hay)) return "Software";
    return "Other";
  }
  if (/facebook|bushra/.test(merchant.toLowerCase())) return "Marketing";
  if (/adobe|google workspace|porkbun|backblaze|honeybook|pic-time/.test(merchant.toLowerCase())) {
    return "Software";
  }
  if (/etsy|amazon|hobby|michaels|kate|backdrop|hello little|luneberry|once upon|homesense|glass shack/.test(merchant.toLowerCase())) {
    return "Supplies";
  }
  return "Review";
}

function loadSheet2026(): SheetRow[] {
  const text = fs.readFileSync("Porchlight Expenses - Sheet1.csv", "utf8");
  const rows = parseCsv(text);
  // CSV headers: Porchlight Expenses, Date, Cost, Item Purchased, Category
  const out: SheetRow[] = [];
  for (const r of rows) {
    const merchant = (r["Porchlight Expenses"] || Object.values(r)[0] || "").trim();
    const dateRaw = (r.Date || Object.values(r)[1] || "").trim();
    const amount = parseMoney(r.Cost || Object.values(r)[2] || "");
    const item = (r["Item Purchased"] || Object.values(r)[3] || "").trim();
    const sheetCat = (r.Category || Object.values(r)[4] || "").trim();
    if (!merchant || amount == null) continue;
    if (/^total|^expenses-|^2026 expenses/i.test(merchant)) continue;
    if (/home office/i.test(sheetCat)) continue;
    const date = parseSheetDate(dateRaw);
    if (!date || date.getUTCFullYear() !== 2026) continue;
    out.push({
      merchant,
      date,
      amount,
      item,
      mappedCat: mapSheetCategory(sheetCat, merchant, item),
    });
  }
  return out;
}

function isHighConfidenceBusiness(name: string, merchant: string | null): {
  category: string;
  reason: string;
} | null {
  const t = `${merchant ?? ""} ${name}`.toLowerCase();
  if (/www\.mpb\.com|\bmpb\b/.test(t)) return { category: "Other", reason: "MPB camera gear" };
  if (/pictime|pic-time/.test(t)) return { category: "Software", reason: "Pic-Time" };
  if (/honeybook/.test(t)) return { category: "Software", reason: "HoneyBook" };
  if (/uprint/.test(t)) return { category: "Supplies", reason: "Uprinting" };
  if (/gsuite_porchli|g suite_porchli|workspace_porchli|google workspace/.test(t)) {
    return { category: "Software", reason: "Google Workspace Porchlight" };
  }
  if (/facebk|facebook/.test(t)) return { category: "Marketing", reason: "Facebook ads" };
  if (/backblaze/.test(t)) return { category: "Software", reason: "Backblaze backup" };
  if (/porkbun/.test(t)) return { category: "Software", reason: "Porkbun domains" };
  if (/adobe/.test(t)) return { category: "Software", reason: "Adobe subscription" };
  if (/kate.*backdrop|backdrop.*kate|avezano|luneberry|hello little/.test(t)) {
    return { category: "Supplies", reason: "Photo backdrop/props vendor" };
  }
  if (/bushra|busrask/.test(t)) return { category: "Marketing", reason: "Facebook ads agency" };
  return null;
}

function loadRh2026(): ImportRow[] {
  const rows = parseCsv(fs.readFileSync("RobinHoodCC2026.csv", "utf8"));
  const out: ImportRow[] = [];
  for (const r of rows) {
    if (r.Status === "Declined") continue;
    // Skip pending — Plaid already has recent pending/posted; avoid double-count
    if (r.Status === "Pending") continue;
    const amount = Number(r.Amount);
    if (!Number.isFinite(amount)) continue;
    const [y, m, d] = r.Date.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const merchant = r.Merchant || "";
    const description = r.Description || "";
    const type = r.Type || "Purchase";
    const cardholder = r.Cardholder || "";
    const time = r.Time || "";
    const exportKey = hashKey([
      r.Date,
      time,
      amount.toFixed(2),
      type,
      merchant,
      description,
      cardholder,
    ]);
    out.push({
      accountId: ACCOUNTS.rh2923,
      date,
      amount,
      name: merchant || description || "Robinhood charge",
      merchantName: merchant || null,
      pending: false,
      exportKey,
      source: "RobinHoodCC2026.csv",
      type,
      cardholder,
    });
  }
  return out;
}

function loadChaseCc2594(): ImportRow[] {
  const rows = parseCsv(fs.readFileSync("Chase2594_Activity_20260801.csv", "utf8"));
  const out: ImportRow[] = [];
  for (const r of rows) {
    const chaseAmt = Number(r.Amount);
    if (!Number.isFinite(chaseAmt)) continue;
    const date =
      parseChaseDate(r["Post Date"] || "") || parseChaseDate(r["Transaction Date"] || "");
    if (!date) continue;
    const desc = decodeHtml(r.Description || "");
    const type = r.Type || "";
    const amount = -chaseAmt; // Chase CC → Plaid
    const exportKey = hashKey([
      date.toISOString().slice(0, 10),
      amount.toFixed(2),
      type,
      desc,
      r["Transaction Date"] || "",
    ]);
    out.push({
      accountId: ACCOUNTS.chase2594,
      date,
      amount,
      name: desc || "Chase charge",
      merchantName: desc || null,
      pending: false,
      exportKey,
      source: "Chase2594_Activity_20260801.csv",
      type,
    });
  }
  return out;
}

function loadChaseBank(file: string, accountId: string, source: string): ImportRow[] {
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const out: ImportRow[] = [];
  for (const r of rows) {
    const chaseAmt = Number(r.Amount);
    if (!Number.isFinite(chaseAmt)) continue;
    const date = parseChaseDate(r["Posting Date"] || "");
    if (!date) continue;
    const desc = decodeHtml(r.Description || "");
    const type = r.Type || r.Details || "";
    const amount = -chaseAmt; // Chase bank → Plaid
    const check = r["Check or Slip #"] || "";
    const exportKey = hashKey([
      date.toISOString().slice(0, 10),
      amount.toFixed(2),
      type,
      desc,
      check,
      r.Balance || "",
    ]);
    out.push({
      accountId,
      date,
      amount,
      name: desc || "Chase transaction",
      merchantName: null,
      pending: false,
      exportKey,
      source,
      type,
    });
  }
  return out;
}

function findExistingMatch(
  existing: ExistingTx[],
  date: Date,
  amount: number,
  maxDayDrift = 2,
): ExistingTx | null {
  // Prefer exact date
  const exact = existing.filter(
    (e) =>
      !e.used &&
      e.date.toISOString().slice(0, 10) === date.toISOString().slice(0, 10) &&
      Math.abs(e.amount - amount) < 0.02,
  );
  if (exact.length) return exact[0];

  const near = existing
    .filter(
      (e) => !e.used && dayDiff(e.date, date) <= maxDayDrift && Math.abs(e.amount - amount) < 0.02,
    )
    .sort((a, b) => dayDiff(a.date, date) - dayDiff(b.date, date));
  return near[0] ?? null;
}

function matchSheetToRows(
  sheet: SheetRow[],
  rows: ImportRow[],
): Map<string, { sheet: SheetRow; category: string }> {
  const usedSheet = new Set<SheetRow>();
  const usedRow = new Set<string>();
  const out = new Map<string, { sheet: SheetRow; category: string }>();
  const candidates: Array<{ sheet: SheetRow; row: ImportRow; score: number }> = [];

  for (const s of sheet) {
    for (const r of rows) {
      if (r.accountId !== ACCOUNTS.rh2923) continue;
      if (Math.abs(r.amount - s.amount) > 0.02) continue;
      const dd = dayDiff(r.date, s.date);
      const maxDays = /amazon|etsy|walmart/i.test(s.merchant) ? 7 : 5;
      if (dd > maxDays) continue;
      const mScore = merchantScore(s.merchant, r.merchantName || "", r.name);
      if (mScore >= 3) {
        candidates.push({ sheet: s, row: r, score: mScore * 10 + (maxDays - dd) });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (usedSheet.has(c.sheet) || usedRow.has(c.row.exportKey)) continue;
    usedSheet.add(c.sheet);
    usedRow.add(c.row.exportKey);
    out.set(c.row.exportKey, { sheet: c.sheet, category: c.sheet.mappedCat });
  }
  return out;
}

async function loadExisting(accountId: string): Promise<ExistingTx[]> {
  const rows = await prisma.transaction.findMany({
    where: { accountId },
    select: {
      id: true,
      date: true,
      amount: true,
      name: true,
      ledger: true,
      categoryId: true,
      categorySource: true,
      plaidTransactionId: true,
    },
  });
  return rows.map((r) => ({ ...r, used: false }));
}

async function main() {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: ACCOUNTS.rh2923 },
  });
  const workspaceId = account.workspaceId;

  const sheet = loadSheet2026();
  const rh = loadRh2026();
  const chase2594 = loadChaseCc2594();
  const chase9730 = loadChaseBank(
    "Chase9730_Activity_20260801.csv",
    ACCOUNTS.chase9730,
    "Chase9730_Activity_20260801.csv",
  );
  const chase6771 = loadChaseBank(
    "Chase6771_Activity_20260801.csv",
    ACCOUNTS.chase6771,
    "Chase6771_Activity_20260801.csv",
  );

  const all = [...rh, ...chase2594, ...chase9730, ...chase6771];
  console.log("Loaded rows:", {
    sheet2026: sheet.length,
    rh2026: rh.length,
    chase2594: chase2594.length,
    chase9730: chase9730.length,
    chase6771: chase6771.length,
    total: all.length,
  });

  const sheetMatches = matchSheetToRows(sheet, rh);
  console.log("Sheet→RH matches:", sheetMatches.size);

  const existingByAccount = new Map<string, ExistingTx[]>();
  for (const id of Object.values(ACCOUNTS)) {
    existingByAccount.set(id, await loadExisting(id));
  }

  const bizCats = await prisma.category.findMany({
    where: { workspaceId, ledger: "business" },
  });
  const personalCats = await prisma.category.findMany({
    where: { workspaceId, ledger: "personal" },
  });
  const bizByName = Object.fromEntries(bizCats.map((c) => [c.name, c.id]));
  const personalByName = Object.fromEntries(personalCats.map((c) => [c.name, c.id]));
  const personalRules = await loadCategoryRules(workspaceId, "personal");

  type PlanItem = {
    action: "create" | "skip" | "reclassify";
    row: ImportRow;
    existing?: ExistingTx;
    ledger: "personal" | "business";
    categoryId: string | null;
    categorySource: string | null;
    notes: string | null;
    reason: string;
  };

  const plan: PlanItem[] = [];
  let bizCreate = 0;
  let bizReclass = 0;

  for (const row of all) {
    const existingList = existingByAccount.get(row.accountId)!;
    // Wider drift for RH pending→posted; tighter for Chase
    const drift = row.accountId === ACCOUNTS.rh2923 ? 3 : 1;
    const existing = findExistingMatch(existingList, row.date, row.amount, drift);

    const sheetHit = sheetMatches.get(row.exportKey);
    const hc =
      row.accountId === ACCOUNTS.rh2923
        ? isHighConfidenceBusiness(row.name, row.merchantName)
        : null;
    const isPayment =
      row.type === "Payment" ||
      /^payment/i.test(row.name) ||
      /automatic payment/i.test(row.name);

    let ledger: "personal" | "business" = "personal";
    let categoryId: string | null = null;
    let categorySource: string | null = null;
    let notes: string | null = `Imported from ${row.source}`;
    let bizReason = "";

    if (sheetHit) {
      ledger = "business";
      categoryId = bizByName[sheetHit.category] ?? bizByName.Review ?? null;
      categorySource = "user";
      notes = [
        "Porchlight business (matched sheet)",
        sheetHit.sheet.item || null,
        `sheet: ${sheetHit.sheet.merchant}`,
      ]
        .filter(Boolean)
        .join(" · ");
      bizReason = "sheet";
    } else if (hc) {
      ledger = "business";
      categoryId = bizByName[hc.category] ?? bizByName.Review ?? null;
      categorySource = "user";
      notes = `Porchlight business (${hc.reason}) · from ${row.source}`;
      bizReason = "high-conf";
    } else if (isPayment) {
      categoryId = personalByName.Transfers ?? null;
      categorySource = "user";
    }

    if (existing) {
      existing.used = true;
      const needsBiz =
        ledger === "business" &&
        (existing.ledger !== "business" ||
          existing.categorySource !== "user" ||
          existing.categoryId !== categoryId);
      if (needsBiz) {
        plan.push({
          action: "reclassify",
          row,
          existing,
          ledger,
          categoryId,
          categorySource,
          notes,
          reason: `dup+${bizReason || "biz"}`,
        });
        bizReclass++;
      } else {
        plan.push({
          action: "skip",
          row,
          existing,
          ledger: existing.ledger as "personal" | "business",
          categoryId: existing.categoryId,
          categorySource: existing.categorySource,
          notes: null,
          reason: "duplicate",
        });
      }
      continue;
    }

    // Resolve personal category for new non-biz rows (in-memory rules only)
    if (ledger === "personal" && !isPayment) {
      const ruleId = matchRuleCategoryId(
        personalRules,
        row.merchantName,
        row.name,
      );
      if (ruleId) {
        categoryId = ruleId;
        categorySource = "rule";
      } else {
        // No Plaid taxonomy on exports — park in Other
        categoryId = personalByName.Other ?? personalByName.Review ?? null;
        categorySource = "user";
      }
    }

    if (ledger === "business") bizCreate++;
    plan.push({
      action: "create",
      row,
      ledger,
      categoryId,
      categorySource,
      notes,
      reason: bizReason || "new",
    });
  }

  const summary = {
    create: plan.filter((p) => p.action === "create").length,
    skipDup: plan.filter((p) => p.action === "skip").length,
    reclassify: plan.filter((p) => p.action === "reclassify").length,
    bizCreate,
    bizReclass,
    bySource: {} as Record<string, { create: number; skip: number; reclass: number }>,
  };
  for (const p of plan) {
    const s = p.row.source;
    summary.bySource[s] ??= { create: 0, skip: 0, reclass: 0 };
    if (p.action === "create") summary.bySource[s].create++;
    else if (p.action === "skip") summary.bySource[s].skip++;
    else summary.bySource[s].reclass++;
  }

  console.log("\nPlan summary:", summary);

  const bizCreates = plan.filter((p) => p.action === "create" && p.ledger === "business");
  console.log(`\nBusiness creates (${bizCreates.length}):`);
  for (const p of bizCreates
    .sort((a, b) => a.row.date.getTime() - b.row.date.getTime())
    .slice(0, 40)) {
    console.log(
      `  ${p.row.date.toISOString().slice(0, 10)} $${Math.abs(p.row.amount).toFixed(2)} ${p.row.name.slice(0, 40)} [${p.reason}]`,
    );
  }
  if (bizCreates.length > 40) console.log(`  ... +${bizCreates.length - 40} more`);

  const reclasses = plan.filter((p) => p.action === "reclassify");
  if (reclasses.length) {
    console.log(`\nReclassify existing to business (${reclasses.length}):`);
    for (const p of reclasses) {
      console.log(
        `  ${p.row.date.toISOString().slice(0, 10)} $${Math.abs(p.row.amount).toFixed(2)} ${p.existing!.name.slice(0, 40)} ← ${p.row.name.slice(0, 30)}`,
      );
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }

  let created = 0;
  let updated = 0;
  const toCreate = plan.filter((p) => p.action === "create");

  // Batch create for speed
  const chunkSize = 100;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const chunk = toCreate.slice(i, i + chunkSize);
    await prisma.transaction.createMany({
      data: chunk.map((p) => ({
        workspaceId,
        accountId: p.row.accountId,
        categoryId: p.categoryId,
        categorySource: p.categorySource,
        plaidTransactionId: `export:${p.row.source}:${p.row.exportKey}`,
        amount: p.row.amount,
        date: p.row.date,
        name: p.row.name,
        merchantName: p.row.merchantName,
        pending: p.row.pending,
        ledger: p.ledger,
        notes: p.notes,
        isoCurrencyCode: "USD",
      })),
      skipDuplicates: true,
    });
    created += chunk.length;
    if (i % 300 === 0) console.log(`  created ${Math.min(i + chunkSize, toCreate.length)}/${toCreate.length}`);
  }

  for (const p of plan.filter((x) => x.action === "reclassify")) {
    await prisma.transaction.update({
      where: { id: p.existing!.id },
      data: {
        ledger: p.ledger,
        categoryId: p.categoryId,
        categorySource: p.categorySource,
        notes: p.notes,
      },
    });
    updated++;
  }

  console.log(`\nApplied: created≈${created} reclassified=${updated} skipped=${summary.skipDup}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

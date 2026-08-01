/**
 * One-off: import RobinHoodCC2025.xlsx onto Robinhood Credit Card **2923,
 * classify Porchlight sheet matches as business.
 *
 * Usage: npx tsx scripts/import-rhcc-2025.ts [--apply]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createHash } from "crypto";
import fs from "fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { loadCategoryRules, resolveCategory } from "../src/lib/categorize";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const RH_ACCOUNT_ID = "cmryf3p0i00084wgl3d85s8z9";
// Resolved from the Robinhood account at runtime (do not hardcode).
let WORKSPACE_ID = "";

type SheetRow = {
  merchant: string;
  date: Date;
  amount: number;
  item: string;
  sheetCat: string;
  mappedCat: string;
};

type RhRow = {
  date: Date;
  time: string;
  cardholder: string;
  amount: number;
  status: string;
  type: string;
  merchant: string;
  description: string;
  exportKey: string;
};

function parseMoney(s: string): number | null {
  const t = (s || "").replace(/[$,\s]/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
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
  // M/D with no year → assume 2025 (sheet Christmas section)
  m = raw.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return new Date(Date.UTC(2025, Number(m[1]) - 1, Number(m[2])));
  return null;
}

function parseCsvRow(line: string): string[] {
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
  return "Supplies";
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
  const aTokens = a.split(" ").filter((t) => t.length >= 3);
  let hits = 0;
  for (const t of aTokens) if (b.includes(t)) hits++;
  if (aTokens.length && hits === aTokens.length) return 8;
  if (hits > 0) return 3 + hits;
  // common aliases
  const aliases: Record<string, string[]> = {
    facebook: ["facebk", "facebook", "meta"],
    "facebook ads": ["facebk", "facebook"],
    "facebook ad": ["facebk", "facebook"],
    adobe: ["adobe"],
    "adobe cloud": ["adobe"],
    amazon: ["amazon", "amzn"],
    walmart: ["walmart", "wm supercenter"],
    mpb: ["mpb"],
    "hobby lobby": ["hobby lobby", "hobby-lobby"],
    "b&h": ["b h", "bhphoto", "b&h"],
    "pic-time and honeybook": ["pictime", "pic time", "honeybook"],
    "kate's backdrops": ["backdrop", "kate"],
    "kate backdrops": ["backdrop", "kate"],
    avezano: ["avezano", "backdrop"],
    "home depot": ["home depot"],
    ikea: ["ikea"],
    michaels: ["michaels"],
    etsy: ["etsy"],
    "google workspace": ["google", "gsuite", "workspace"],
    backblaze: ["backblaze"],
    porkbun: ["porkbun"],
    uprint: ["uprint", "print"],
    dba: ["dba", "assumed name"],
  };
  const key = sheetMerchant.toLowerCase().trim();
  for (const [k, vals] of Object.entries(aliases)) {
    if (key.includes(k) || k.includes(key)) {
      if (vals.some((v) => b.includes(v))) return 9;
    }
  }
  return 0;
}

function loadSheet2025(): SheetRow[] {
  const text = fs.readFileSync("Porchlight Expenses - Sheet1.csv", "utf8");
  const rows = text.split(/\r?\n/).map(parseCsvRow).slice(1);
  const out: SheetRow[] = [];
  for (const cols of rows) {
    const merchant = (cols[0] || "").trim();
    const dateRaw = (cols[1] || "").trim();
    const amount = parseMoney(cols[2] || "");
    const item = (cols[3] || "").trim();
    const sheetCat = (cols[4] || "").trim();
    if (!merchant || amount == null) continue;
    if (/^total expenses|^expenses-|^2026 expenses/i.test(merchant)) continue;
    if (/home office/i.test(sheetCat)) continue;
    const date = parseSheetDate(dateRaw);
    if (!date) continue;
    if (date.getUTCFullYear() !== 2025) continue;
    out.push({
      merchant,
      date,
      amount,
      item,
      sheetCat,
      mappedCat: mapSheetCategory(sheetCat, merchant, item),
    });
  }
  return out;
}

function loadRh2025(): RhRow[] {
  const wb = XLSX.readFile("RobinHoodCC2025.xlsx");
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]) as Record<
    string,
    unknown
  >[];
  const out: RhRow[] = [];
  for (const r of raw) {
    const status = String(r.Status || "");
    if (status === "Declined") continue;
    const dateStr = String(r.Date || "");
    const time = String(r.Time || "");
    const amount = Number(r.Amount);
    if (!dateStr || !Number.isFinite(amount)) continue;
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const merchant = String(r.Merchant || "");
    const description = String(r.Description || "");
    const type = String(r.Type || "Purchase");
    const cardholder = String(r.Cardholder || "");
    const exportKey = createHash("sha1")
      .update([dateStr, time, amount.toFixed(2), type, merchant, description, cardholder].join("|"))
      .digest("hex")
      .slice(0, 24);
    out.push({
      date,
      time,
      cardholder,
      amount,
      status,
      type,
      merchant,
      description,
      exportKey,
    });
  }
  return out;
}

function dayDiff(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}

type Match = { sheet: SheetRow; rh: RhRow; score: number };

function isHighConfidenceBusiness(r: RhRow): { category: string; reason: string } | null {
  const t = `${r.merchant} ${r.description}`.toLowerCase();
  if (/www\.mpb\.com|\bmpb\b/.test(t)) return { category: "Other", reason: "MPB camera gear" };
  if (/pictime|pic-time/.test(t)) return { category: "Software", reason: "Pic-Time" };
  if (/honeybook/.test(t)) return { category: "Software", reason: "HoneyBook" };
  if (/uprint/.test(t)) return { category: "Supplies", reason: "Uprinting" };
  if (/gsuite_porchli|g suite_porchli|workspace_porchli/.test(t)) {
    return { category: "Software", reason: "Google Workspace Porchlight" };
  }
  if (/facebk|facebook/.test(t)) return { category: "Marketing", reason: "Facebook ads" };
  if (/backblaze/.test(t)) return { category: "Software", reason: "Backblaze backup" };
  // Consolidated Apr 3 Walmart camera purchase (sheet itemized separately)
  if (
    r.date.toISOString().slice(0, 10) === "2025-04-03" &&
    /walmart/i.test(t) &&
    r.amount > 5000
  ) {
    return { category: "Other", reason: "Walmart camera kit (sheet Large Assets/Misc)" };
  }
  return null;
}

function matchSheetToRh(sheet: SheetRow[], rh: RhRow[]): {
  matches: Match[];
  unmatchedSheet: SheetRow[];
} {
  const used = new Set<string>();
  const matches: Match[] = [];
  const candidates: Match[] = [];

  for (const s of sheet) {
    for (const r of rh) {
      if (r.type !== "Purchase" && r.type !== "Fee") continue;
      if (Math.abs(r.amount - s.amount) > 0.02) continue;
      const dd = dayDiff(r.date, s.date);
      // Amazon/online often posts 0–7 days later
      const maxDays = /amazon|amzn|etsy|walmart/i.test(s.merchant) ? 7 : 5;
      if (dd > maxDays) continue;
      const mScore = merchantScore(s.merchant, r.merchant, r.description);
      const score = mScore * 10 + (maxDays - dd);
      if (mScore >= 3) candidates.push({ sheet: s, rh: r, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const sheetUsed = new Set<SheetRow>();
  for (const c of candidates) {
    if (used.has(c.rh.exportKey) || sheetUsed.has(c.sheet)) continue;
    used.add(c.rh.exportKey);
    sheetUsed.add(c.sheet);
    matches.push(c);
  }

  // Second pass: unique amount within 2 days
  for (const s of sheet) {
    if (sheetUsed.has(s)) continue;
    const opts = rh
      .filter(
        (r) =>
          !used.has(r.exportKey) &&
          (r.type === "Purchase" || r.type === "Fee") &&
          Math.abs(r.amount - s.amount) < 0.02 &&
          dayDiff(r.date, s.date) <= 2,
      )
      .map((r) => ({
        sheet: s,
        rh: r,
        score: merchantScore(s.merchant, r.merchant, r.description),
      }))
      .sort((a, b) => b.score - a.score);
    if (opts[0] && opts[0].score >= 3) {
      const best = opts[0];
      used.add(best.rh.exportKey);
      sheetUsed.add(s);
      matches.push(best);
    }
  }

  const unmatchedSheet = sheet.filter((s) => !sheetUsed.has(s));
  return { matches, unmatchedSheet };
}

async function main() {
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: RH_ACCOUNT_ID },
  });
  WORKSPACE_ID = account.workspaceId;
  console.log(`Workspace: ${WORKSPACE_ID} account: ${account.name}`);

  const sheet = loadSheet2025();
  const rh = loadRh2025();
  console.log(`Sheet 2025 rows: ${sheet.length}`);
  console.log(`RH posted rows: ${rh.length}`);

  const { matches, unmatchedSheet } = matchSheetToRh(sheet, rh);
  const matchByKey = new Map(matches.map((m) => [m.rh.exportKey, m]));

  const highConf: { rh: RhRow; category: string; reason: string }[] = [];
  for (const r of rh) {
    if (matchByKey.has(r.exportKey)) continue;
    const hc = isHighConfidenceBusiness(r);
    if (hc) highConf.push({ rh: r, ...hc });
  }
  const highConfKeys = new Set(highConf.map((h) => h.rh.exportKey));

  const bizTotal =
    matches.reduce((s, m) => s + m.rh.amount, 0) +
    highConf.reduce((s, h) => s + h.rh.amount, 0);

  console.log(`\nSheet exact matches: ${matches.length}`);
  console.log(`High-confidence business merchants: ${highConf.length}`);
  console.log(`Business total $: ${bizTotal.toFixed(2)}`);
  console.log(`Unmatched sheet rows (likely other card/cash/combined): ${unmatchedSheet.length}`);

  console.log("\nSHEET MATCHES:");
  for (const m of matches.sort((a, b) => a.rh.date.getTime() - b.rh.date.getTime())) {
    console.log(
      `  ${m.rh.date.toISOString().slice(0, 10)} $${m.rh.amount.toFixed(2)} | sheet:${m.sheet.merchant} → rh:${m.rh.merchant} | ${m.sheet.mappedCat} | ${m.sheet.item.slice(0, 40)}`,
    );
  }

  console.log("\nHIGH-CONFIDENCE BUSINESS:");
  for (const h of highConf.sort((a, b) => a.rh.date.getTime() - b.rh.date.getTime())) {
    console.log(
      `  ${h.rh.date.toISOString().slice(0, 10)} $${h.rh.amount.toFixed(2)} | ${h.rh.merchant} | ${h.category} | ${h.reason}`,
    );
  }

  console.log("\nUNMATCHED SHEET (not found as separate RH charge):");
  for (const s of unmatchedSheet) {
    console.log(
      `  ${s.date.toISOString().slice(0, 10)} $${s.amount.toFixed(2)} ${s.merchant} | ${s.item} | ${s.sheetCat}`,
    );
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write to the database.");
    return;
  }

  const bizCats = await prisma.category.findMany({
    where: { workspaceId: WORKSPACE_ID, ledger: "business" },
  });
  const personalCats = await prisma.category.findMany({
    where: { workspaceId: WORKSPACE_ID, ledger: "personal" },
  });
  const bizByName = Object.fromEntries(bizCats.map((c) => [c.name, c.id]));
  const personalByName = Object.fromEntries(personalCats.map((c) => [c.name, c.id]));

  const personalRules = await loadCategoryRules(WORKSPACE_ID, "personal");
  const highConfByKey = new Map(highConf.map((h) => [h.rh.exportKey, h]));

  let created = 0;
  let skipped = 0;
  let bizCount = 0;

  for (const r of rh) {
    const plaidTransactionId = `rhcc-export:2025:${r.exportKey}`;
    const existing = await prisma.transaction.findUnique({
      where: { plaidTransactionId },
    });
    if (existing) {
      skipped++;
      continue;
    }

    const match = matchByKey.get(r.exportKey);
    const hc = highConfByKey.get(r.exportKey);
    const isPayment = r.type === "Payment" || /^payment/i.test(r.merchant);

    let ledger: "personal" | "business" = "personal";
    let categoryId: string | null = null;
    let categorySource: string | null = null;
    let notes: string | null = `Imported from RobinHoodCC2025.xlsx (${r.type}; ${r.cardholder})`;

    if (match) {
      ledger = "business";
      categoryId = bizByName[match.sheet.mappedCat] ?? bizByName.Review ?? null;
      categorySource = "user";
      notes = [
        "Porchlight business (matched sheet)",
        match.sheet.item || null,
        `sheet merchant: ${match.sheet.merchant}`,
        `RH: ${r.merchant}`,
      ]
        .filter(Boolean)
        .join(" · ");
      bizCount++;
    } else if (hc) {
      ledger = "business";
      categoryId = bizByName[hc.category] ?? bizByName.Review ?? null;
      categorySource = "user";
      notes = `Porchlight business (${hc.reason}) · RH: ${r.merchant}`;
      bizCount++;
    } else if (isPayment) {
      categoryId = personalByName.Transfers ?? null;
      categorySource = "user";
    } else {
      const resolved = await resolveCategory({
        workspaceId: WORKSPACE_ID,
        ledger: "personal",
        merchantName: r.merchant,
        name: r.description || r.merchant,
        plaidPrimary: null,
        plaidDetailed: null,
        rules: personalRules,
      });
      categoryId = resolved.categoryId ?? null;
      categorySource = resolved.source ?? null;
    }

    await prisma.transaction.create({
      data: {
        workspaceId: WORKSPACE_ID,
        accountId: RH_ACCOUNT_ID,
        categoryId,
        categorySource,
        plaidTransactionId,
        amount: r.amount,
        date: r.date,
        name: r.merchant || r.description || "Robinhood charge",
        merchantName: r.merchant || null,
        pending: false,
        ledger,
        notes,
        isoCurrencyCode: "USD",
      },
    });
    created++;
  }

  console.log(`\nApplied: created=${created} skippedExisting=${skipped} business=${bizCount}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

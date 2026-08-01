import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const prisma = new PrismaClient();

function parseMoney(s: string): number | null {
  const t = (s || "").replace(/[$,\s]/g, "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s: string): Date | null {
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

function mapCategory(sheetCat: string, merchant: string, item: string): string {
  const c = (sheetCat || "").trim().toLowerCase();
  const hay = `${merchant} ${item}`.toLowerCase();
  if (c === "ads") return "Marketing";
  if (c === "supplies") return "Supplies";
  if (c === "large assets") return "Other";
  if (c === "misc") {
    if (/adobe|pic-time|honeybook|subscription|software/.test(hay)) return "Software";
    return "Other";
  }
  if (c === "home office") return "SKIP_TAX";
  if (/facebook|bushra/.test(merchant.toLowerCase())) return "Marketing";
  if (/adobe|google workspace|porkbun|backblaze|honeybook|pic-time/.test(merchant.toLowerCase())) {
    return "Software";
  }
  if (
    /etsy|amazon|hobby lobby|michaels|kate|backdrop|hello little|luneberry|once upon|homesense|avezano|mpb|walmart|ikea|b&h|uprint|dba|home depot|little glass shack/.test(
      merchant.toLowerCase(),
    )
  ) {
    return "Supplies";
  }
  return "Review";
}

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

type Row = {
  merchant: string;
  dateRaw: string;
  date: Date | null;
  amount: number | null;
  item: string;
  sheetCat: string;
  mapped: string;
  status: string;
};

async function main() {
  const text = fs.readFileSync("Porchlight Expenses - Sheet1.csv", "utf8");
  const rows = text.split(/\r?\n/).map(parseRow).slice(1);
  const parsed: Row[] = [];

  for (const cols of rows) {
    const merchant = (cols[0] || "").trim();
    const dateRaw = (cols[1] || "").trim();
    const amount = parseMoney(cols[2] || "");
    const item = (cols[3] || "").trim();
    const sheetCat = (cols[4] || "").trim();
    if (!merchant && !dateRaw && amount == null) continue;
    if (/^total expenses/i.test(merchant)) {
      parsed.push({
        merchant,
        dateRaw,
        date: null,
        amount,
        item,
        sheetCat,
        mapped: "SKIP",
        status: "summary",
      });
      continue;
    }
    if (/^expenses-/i.test(merchant) || /home office/i.test(sheetCat)) {
      parsed.push({
        merchant,
        dateRaw,
        date: null,
        amount,
        item,
        sheetCat,
        mapped: "SKIP_TAX",
        status: "tax_deduction",
      });
      continue;
    }
    if (/^2026 expenses$/i.test(merchant)) continue;

    const date = parseDate(dateRaw);
    const mapped = mapCategory(sheetCat, merchant, item);
    let status = "ok";
    if (amount == null) status = "no_amount";
    else if (!dateRaw) status = "no_date";
    else if (!date) status = "bad_date";
    else if (!merchant) status = "no_merchant";
    parsed.push({ merchant, dateRaw, date, amount, item, sheetCat, mapped, status });
  }

  const importable = parsed.filter((r) => r.status === "ok" && !r.mapped.startsWith("SKIP"));
  const skipped = parsed.filter((r) => r.status !== "ok" || r.mapped.startsWith("SKIP"));

  const byYear: Record<string, { count: number; total: number }> = {};
  const byCat: Record<string, { count: number; total: number }> = {};
  for (const r of importable) {
    const y = String(r.date!.getUTCFullYear());
    byYear[y] ??= { count: 0, total: 0 };
    byYear[y].count++;
    byYear[y].total += r.amount!;
    byCat[r.mapped] ??= { count: 0, total: 0 };
    byCat[r.mapped].count++;
    byCat[r.mapped].total += r.amount!;
  }

  console.log(
    "IMPORTABLE",
    importable.length,
    "total $",
    importable.reduce((s, r) => s + r.amount!, 0).toFixed(2),
  );
  console.log("BY YEAR", byYear);
  console.log("BY CAT", byCat);
  console.log("\nSKIPPED:");
  for (const r of skipped) {
    console.log(
      `  [${r.status}|${r.mapped}] ${r.merchant} | ${r.dateRaw} | ${r.amount} | ${r.item} | ${r.sheetCat}`,
    );
  }

  const ws = await prisma.workspace.findFirst({ where: { name: "Family" } });
  const existing = await prisma.transaction.findMany({
    where: { workspaceId: ws!.id, ledger: "business", pending: false },
    select: { date: true, amount: true, name: true },
  });

  const overlaps: string[] = [];
  for (const r of importable) {
    const day = r.date!.toISOString().slice(0, 10);
    const hits = existing.filter((e) => {
      const ed = e.date.toISOString().slice(0, 10);
      return ed === day && Math.abs(Math.abs(e.amount) - r.amount!) < 0.02;
    });
    if (hits.length) {
      overlaps.push(`${day} $${r.amount} ${r.merchant} <-> ${hits.map((h) => h.name).join(" | ")}`);
    }
  }
  console.log("\nPOTENTIAL OVERLAPS WITH EXISTING:", overlaps.length);
  for (const o of overlaps) console.log(" ", o);
}

main().finally(() => prisma.$disconnect());

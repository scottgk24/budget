/**
 * Load paid Photoshoot Schedule sessions into Business Income.
 * Skips (and recategorizes) rows that already exist as bank deposits.
 *
 * Usage: npx tsx scripts/import-porchlight-income.ts [--apply]
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

const MANUAL_ACCOUNT_NAME = "Porchlight sessions (manual)";
const WINDOW_DAYS = 30;

type SheetSession = {
  key: string;
  name: string;
  date: string; // YYYY-MM-DD
  sessionType: string;
  paid: number;
  tip: number;
  method: string;
  tokens: string[];
};

const SESSIONS: SheetSession[] = [
  s("carlie-jones", "Carlie Jones", "2025-11-01", "Family", 100, 0, "cash", ["jones", "carlie"]),
  s("amanda-mccoy", "Amanda McCoy", "2025-11-08", "Family", 100, 0, "venmo", ["mccoy", "amanda"]),
  s("dawn-provencher", "Dawn Provencher", "2025-11-16", "Family", 150, 0, "venmo", ["provencher", "dawn"]),
  s("bita-elliott", "Bita Elliott", "2025-11-21", "Newborn", 100, 0, "venmo", ["elliott", "bita"]),
  s("nicki-ryan", "Nicki Ryan", "2025-11-29", "Family", 100, 0, "venmo", ["ryan", "nicki"]),
  s("sarah-west", "Sarah West", "2025-11-30", "Senior", 150, 0, "venmo", ["west", "sarah"]),
  s("ashley-freni", "Ashley Freni", "2025-12-07", "Family", 150, 0, "venmo", ["freni", "ashley"]),
  s("michelle-varela", "Michelle Varela", "2025-12-14", "Family", 100, 0, "venmo", ["varela", "michelle"]),
  s("amanda-mayberry", "Amanda Mayberry", "2025-12-13", "Family", 100, 0, "venmo", ["mayberry"]),
  s("hafsa-hussaini", "Hafsa Hussaini", "2025-12-15", "Newborn", 150, 0, "venmo", ["hussaini", "hafsa"]),
  s("amy-baskett", "Amy Baskett", "2025-12-14", "Christmas Mini", 50, 0, "venmo", ["baskett"]),
  s("kristina-yuen-mini", "Kristina Yuen", "2025-12-13", "Christmas Mini", 50, 50, "zelle", ["yuen", "kristina"]),
  s("catherine-carroll", "Catherine Carroll", "2025-12-19", "Silver Muzzle", 100, 0, "zelle", ["carroll", "catherine"]),
  s("sandeep-manukonda", "Sandeep Manukonda", "2025-12-19", "Newborn", 150, 0, "zelle", ["manukonda", "sandeep"]),
  s("amy-bockoven", "Amy Bockoven", "2026-01-18", "Senior", 150, 0, "zelle", ["bockoven"]),
  s("rasmi-manandhar", "Rasmi Manandhar", "2026-01-06", "Newborn", 150, 0, "zelle", ["manandhar", "rasmi"]),
  s("joy-bozzo", "Joy Bozzo", "2026-01-09", "Work photos", 100, 250, "zelle", ["bozzo"]),
  s("nick-mccoy", "Nick Mccoy", "2025-12-25", "Gift session", 100, 25, "venmo", ["mccoy", "nick"]),
  s("sanjay-gudala", "Sanjay Gudala", "2026-02-24", "Newborn", 250, 0, "zelle", ["gudala", "sanjay"]),
  s("becki-hein", "Becki Hein", "2026-03-10", "Headshots", 50, 0, "zelle", ["hein", "becki"]),
  s("michelle-moore", "Michelle Moore", "2026-03-24", "Senior", 300, 0, "zelle", ["moore"]),
  s("sofia-taborga", "Sofia Taborga", "2026-04-09", "Senior", 200, 0, "venmo", ["taborga", "sofia"]),
  s("premika-r", "Premika R", "2026-04-02", "Newborn", 300, 0, "zelle", ["premika", "mallipaddi", "bhargav"]),
  s("shyam-maternity", "Shyam", "2026-04-19", "Maternity", 150, 0, "cash", ["shyam"]),
  s("yuen-wildflowers", "Yuen Wildflowers", "2026-04-25", "Wildflower Family", 150, 0, "zelle", ["yuen"]),
  s("rendi-everett-house", "Rendi Everett", "2026-05-10", "Staged House", 50, 0, "venmo", ["everett", "rendi", "pelican"]),
  s("baby-carson", "Baby Carson", "2026-05-11", "Newborn", 200, 0, "zelle", ["carson", "kauser", "lori"]),
  s("nathan-aina", "Nathan / Gideon Aina", "2026-05-15", "6 month", 100, 0, "zelle", ["aina", "gideon", "nathan"]),
  s("hemant-maternity", "Hemant Gupta", "2026-06-09", "Maternity", 200, 0, "zelle", ["gupta", "hemant", "hermant"]),
  s("hemant-newborn", "Hemant Gupta", "2026-06-26", "Newborn", 300, 0, "zelle", ["gupta", "ashima", "tayal"]),
  s("faith-chip", "Faith / Chip Riley Roberts", "2026-06-05", "Family", 100, 50, "unknown", ["riley", "roberts", "faith"]),
];

function s(
  key: string,
  name: string,
  date: string,
  sessionType: string,
  paid: number,
  tip: number,
  method: string,
  tokens: string[],
): SheetSession {
  return { key, name, date, sessionType, paid, tip, method, tokens };
}

function parseDay(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: Date): number {
  const ms = Math.abs(parseDay(a).getTime() - b.getTime());
  return ms / 86_400_000;
}

function nearAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.03;
}

function haystack(name: string, merchant: string | null): string {
  return `${name} ${merchant ?? ""}`.toLowerCase();
}

function nameHit(session: SheetSession, text: string): boolean {
  return session.tokens.some((t) => t.length >= 4 && text.includes(t));
}

type Existing = {
  id: string;
  date: Date;
  amount: number;
  name: string;
  merchantName: string | null;
  ledger: string;
  categoryId: string | null;
  categoryName: string | null;
  accountName: string;
  notes: string | null;
  used: boolean;
};

type CreateRow = {
  session: SheetSession;
  amount: number;
  kind: "paid" | "tip";
  idKey: string;
};

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { name: "Family" } });
  if (!ws) throw new Error("Family workspace not found");

  const income = await prisma.category.findFirst({
    where: { workspaceId: ws.id, ledger: "business", name: "Income" },
  });
  const transfersBiz = await prisma.category.findFirst({
    where: { workspaceId: ws.id, ledger: "business", name: "Transfers" },
  });
  const transfersPersonal = await prisma.category.findFirst({
    where: { workspaceId: ws.id, ledger: "personal", name: "Transfers" },
  });
  if (!income) throw new Error("Business Income category missing");

  const txs = await prisma.transaction.findMany({
    where: { workspaceId: ws.id, pending: false, amount: { lt: 0 } },
    include: { category: true, account: { select: { name: true } } },
  });

  const existing: Existing[] = txs.map((t) => ({
    id: t.id,
    date: t.date,
    amount: Math.abs(t.amount),
    name: t.name,
    merchantName: t.merchantName,
    ledger: t.ledger,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    accountName: t.account.name,
    notes: t.notes,
    used: false,
  }));

  const alreadyImported = new Set(
    txs
      .filter((t) => t.plaidTransactionId?.startsWith("porchlight-session:"))
      .map((t) => t.plaidTransactionId as string),
  );

  const recategorize: Array<{ tx: Existing; session: SheetSession; why: string }> = [];
  const create: CreateRow[] = [];
  const skipped: string[] = [];

  for (const session of SESSIONS) {
    const pieces: Array<{ amount: number; kind: "paid" | "tip" }> = [
      { amount: session.paid, kind: "paid" },
    ];
    if (session.tip > 0) pieces.push({ amount: session.tip, kind: "tip" });

    const combo = session.paid + session.tip;
    const comboHit =
      session.tip > 0
        ? existing.find((tx) => {
            if (tx.used) return false;
            if (daysBetween(session.date, tx.date) > WINDOW_DAYS) return false;
            if (!nearAmount(tx.amount, combo)) return false;
            return nameHit(session, haystack(tx.name, tx.merchantName));
          })
        : undefined;

    if (comboHit) {
      comboHit.used = true;
      recategorize.push({
        tx: comboHit,
        session,
        why: `paid+tip $${combo} ↔ ${dayKey(comboHit.date)} ${comboHit.name}`,
      });
      continue;
    }

    for (const piece of pieces) {
      const idKey = `porchlight-session:${session.key}:${piece.kind}:${session.date}:${piece.amount}`;
      if (alreadyImported.has(idKey)) {
        skipped.push(`already imported ${idKey}`);
        continue;
      }

      const hit = existing.find((tx) => {
        if (tx.used) return false;
        if (daysBetween(session.date, tx.date) > WINDOW_DAYS) return false;
        if (!nearAmount(tx.amount, piece.amount)) return false;
        return nameHit(session, haystack(tx.name, tx.merchantName));
      });

      if (hit) {
        hit.used = true;
        recategorize.push({
          tx: hit,
          session,
          why: `${piece.kind} $${piece.amount} ↔ ${dayKey(hit.date)} ${hit.name}`,
        });
        continue;
      }

      create.push({ session, amount: piece.amount, kind: piece.kind, idKey });
    }
  }

  const stillCreate: CreateRow[] = [];
  for (const c of create) {
    const hit = existing.find((tx) => {
      if (tx.used) return false;
      if (daysBetween(c.session.date, tx.date) > WINDOW_DAYS) return false;
      return nameHit(c.session, haystack(tx.name, tx.merchantName));
    });
    if (hit) {
      hit.used = true;
      recategorize.push({
        tx: hit,
        session: c.session,
        why: `name match, different amount sheet $${c.amount} vs bank $${hit.amount} · ${dayKey(hit.date)} ${hit.name}`,
      });
      continue;
    }
    stillCreate.push(c);
  }
  create.length = 0;
  create.push(...stillCreate);

  const venmoCashouts = existing.filter(
    (tx) =>
      /venmo/i.test(haystack(tx.name, tx.merchantName)) &&
      /cashout/i.test(haystack(tx.name, tx.merchantName)) &&
      tx.categoryName !== "Transfers",
  );

  console.log(APPLY ? "APPLY" : "DRY RUN");
  console.log("\nREUSE existing bank txs (no new row) — recategorize to Business Income if needed");
  for (const r of recategorize) {
    const sameCat = r.tx.categoryName === "Income" && r.tx.ledger === "business";
    console.log(
      `  ${sameCat ? "OK" : "FIX"} ${r.session.name} · ${r.why} [${r.tx.ledger}/${r.tx.categoryName}/${r.tx.accountName}]`,
    );
  }

  console.log("\nCREATE manual income (no bank match)");
  let createTotal = 0;
  for (const c of create) {
    createTotal += c.amount;
    console.log(
      `  + $${c.amount.toFixed(2)} ${c.kind} ${c.session.name} ${c.session.date} ${c.session.sessionType} via ${c.session.method}`,
    );
  }
  console.log(`  CREATE TOTAL $${createTotal.toFixed(2)} · ${create.length} rows`);

  console.log("\nVENMO CASHOUTS → Transfers (wallet→bank, not session income)");
  for (const tx of venmoCashouts) {
    console.log(`  ${dayKey(tx.date)} $${tx.amount} [${tx.categoryName}] ${tx.name.trim()}`);
  }

  if (skipped.length) {
    console.log("\nSKIP already imported", skipped.length);
  }

  if (!APPLY) {
    console.log("\nRe-run with --apply to write.");
    return;
  }

  let manual = await prisma.account.findFirst({
    where: { workspaceId: ws.id, name: MANUAL_ACCOUNT_NAME },
  });
  if (!manual) {
    manual = await prisma.account.create({
      data: {
        workspaceId: ws.id,
        name: MANUAL_ACCOUNT_NAME,
        officialName: "Venmo/cash sessions — not Plaid-linked",
        type: "other",
        subtype: "other",
        ledger: "business",
        currentBalance: 0,
        availableBalance: 0,
        isoCurrencyCode: "USD",
        isHidden: false,
      },
    });
    console.log("\nCreated account", manual.id);
  }

  let recat = 0;
  for (const r of recategorize) {
    const needsCat = r.tx.categoryId !== income.id || r.tx.ledger !== "business";
    const note = [
      r.tx.notes,
      `Porchlight session: ${r.session.name} · ${r.session.sessionType} · sheet ${r.session.date}`,
    ]
      .filter(Boolean)
      .join(" · ");
    if (!needsCat && r.tx.notes?.includes("Porchlight session:")) continue;
    await prisma.transaction.update({
      where: { id: r.tx.id },
      data: {
        categoryId: income.id,
        categorySource: "user",
        ledger: "business",
        notes: note,
      },
    });
    recat++;
  }

  let created = 0;
  for (const c of create) {
    const exists = await prisma.transaction.findUnique({
      where: { plaidTransactionId: c.idKey },
    });
    if (exists) continue;
    const label =
      c.kind === "tip"
        ? `${c.session.name} · tip`
        : `${c.session.name} · ${c.session.sessionType}`;
    await prisma.transaction.create({
      data: {
        workspaceId: ws.id,
        accountId: manual.id,
        categoryId: income.id,
        categorySource: "user",
        plaidTransactionId: c.idKey,
        amount: -c.amount,
        date: parseDay(c.session.date),
        name: label,
        merchantName: c.session.name,
        pending: false,
        ledger: "business",
        notes: `Photoshoot Schedule · ${c.session.method} · not on linked ${c.session.method === "zelle" ? "bank (no match)" : "Venmo/cash"}`,
        isoCurrencyCode: "USD",
      },
    });
    created++;
  }

  let cashouts = 0;
  for (const tx of venmoCashouts) {
    const catId = tx.ledger === "business" ? transfersBiz?.id : transfersPersonal?.id;
    if (!catId) continue;
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        categoryId: catId,
        categorySource: "user",
        notes: [tx.notes, "Venmo cashout · transfer from wallet, not session income"]
          .filter(Boolean)
          .join(" · "),
      },
    });
    cashouts++;
  }

  console.log("\nWROTE", { recategorized: recat, created, cashoutsToTransfers: cashouts });
}

main().finally(() => prisma.$disconnect());

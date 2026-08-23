/**
 * Dry-run: compare Photoshoot Schedule paid sessions to existing txs.
 * Usage: npx tsx scripts/preview-porchlight-income.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

async function main() {
  const ws = await prisma.workspace.findFirst({ where: { name: "Family" } });
  if (!ws) throw new Error("Family workspace not found");

  const accounts = await prisma.account.findMany({
    where: { workspaceId: ws.id, isHidden: false },
    select: {
      id: true,
      name: true,
      mask: true,
      type: true,
      ledger: true,
      currentBalance: true,
    },
  });
  console.log("ACCOUNTS");
  for (const a of accounts) {
    console.log(
      `  ${a.ledger} ${a.type} ${a.name} ···${a.mask ?? "?"} bal=${a.currentBalance} ${a.id}`,
    );
  }

  const txs = await prisma.transaction.findMany({
    where: { workspaceId: ws.id, pending: false },
    include: { category: true, account: { select: { name: true, ledger: true } } },
    orderBy: { date: "asc" },
  });

  const inflows = txs.filter((t) => t.amount < 0);
  const venmo = txs.filter((t) => /venmo/i.test(`${t.name} ${t.merchantName ?? ""}`));
  const zelle = txs.filter((t) => /zelle/i.test(`${t.name} ${t.merchantName ?? ""}`));
  const bizIncome = txs.filter(
    (t) => t.ledger === "business" && t.category?.name === "Income",
  );

  console.log("\nCOUNTS", {
    txs: txs.length,
    inflows: inflows.length,
    venmo: venmo.length,
    zelle: zelle.length,
    bizIncome: bizIncome.length,
  });

  console.log("\nVENMO TXS");
  for (const t of venmo) {
    console.log(
      `  ${dayKey(t.date)} ${t.ledger} ${t.account.name} ${t.amount} [${t.category?.name ?? "none"}] ${t.name}`,
    );
  }

  console.log("\nZELLE TXS");
  for (const t of zelle) {
    console.log(
      `  ${dayKey(t.date)} ${t.ledger} ${t.account.name} ${t.amount} [${t.category?.name ?? "none"}] ${t.name}`,
    );
  }

  console.log("\nBUSINESS INCOME");
  for (const t of bizIncome) {
    console.log(
      `  ${dayKey(t.date)} ${t.account.name} ${t.amount} ${t.name} :: ${t.notes ?? ""}`,
    );
  }

  console.log("\nBUSINESS INFLOWS (any category)");
  for (const t of inflows.filter((x) => x.ledger === "business")) {
    console.log(
      `  ${dayKey(t.date)} ${t.account.name} ${t.amount} [${t.category?.name ?? "none"}] ${t.name}`,
    );
  }

  const cashish = txs.filter((t) =>
    /cash|deposit|counter credit/i.test(`${t.name} ${t.merchantName ?? ""}`),
  );
  console.log("\nCASH/DEPOSIT-LIKE");
  for (const t of cashish) {
    console.log(
      `  ${dayKey(t.date)} ${t.ledger} ${t.account.name} ${t.amount} [${t.category?.name ?? "none"}] ${t.name}`,
    );
  }
}

main().finally(() => prisma.$disconnect());

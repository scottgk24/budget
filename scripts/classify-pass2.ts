import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";

const u = new URL(process.env.DATABASE_URL!);
u.searchParams.set("connection_limit", "3");
u.searchParams.set("pool_timeout", "60");
const prisma = new PrismaClient({ datasources: { db: { url: u.toString() } } });

const PASS2: Array<{ re: RegExp; cat: string }> = [
  { re: /dairy queen|pluckers|chili'?s|benny'?s bagel|chicano|golden chick|heart rock/i, cat: "Dining" },
  { re: /dollar tree|jostens|academy sports|groupon|casely|crunchlabs|once upon|homesense/i, cat: "Shopping" },
  { re: /kroger/i, cat: "Groceries" },
  { re: /expedia|american airlines|airport/i, cat: "Travel" },
  { re: /kwik kar|chevron|discount tire|cefco|honda/i, cat: "Transport" },
  { re: /petco|petsmart/i, cat: "Pets" },
  { re: /fc dallas|cinepolis|arboretum|drama kids/i, cat: "Entertainment" },
  { re: /wix\.com|musely/i, cat: "Subscriptions" },
  { re: /sport clips|gloss\*|cillas hair|pediatric|patient|ccprosper/i, cat: "Healthcare" },
  { re: /remote online deposit/i, cat: "Income" },
];

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({ where: { name: "Family" } });
  const cats = await prisma.category.findMany({
    where: { workspaceId: ws.id, ledger: "personal" },
  });
  const catId = Object.fromEntries(cats.map((c) => [c.name, c.id]));

  const review = await prisma.transaction.findMany({
    where: {
      workspaceId: ws.id,
      category: { name: "Review" },
      OR: [
        { plaidTransactionId: { startsWith: "export:" } },
        { plaidTransactionId: { startsWith: "rhcc-export:" } },
      ],
    },
    select: { id: true, name: true, merchantName: true, ledger: true },
  });

  const byCat = new Map<string, string[]>();
  for (const tx of review) {
    if (tx.ledger !== "personal") continue;
    const text = `${tx.merchantName || ""} ${tx.name}`;
    const hit = PASS2.find((p) => p.re.test(text));
    if (!hit || !catId[hit.cat]) continue;
    const list = byCat.get(hit.cat) || [];
    list.push(tx.id);
    byCat.set(hit.cat, list);
  }

  let updated = 0;
  for (const [cat, ids] of byCat) {
    const res = await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { categoryId: catId[cat], categorySource: "user" },
    });
    updated += res.count;
    console.log(`  ${cat}: ${res.count}`);
  }
  console.log(`pass2 updated ${updated}`);

  const rows = await prisma.$queryRawUnsafe<Array<{ name: string; n: number }>>(
    `SELECT COALESCE(c.name, '(none)') as name, COUNT(*)::int as n
     FROM "Transaction" t
     LEFT JOIN "Category" c ON c.id = t."categoryId"
     WHERE t."plaidTransactionId" LIKE 'export:%'
        OR t."plaidTransactionId" LIKE 'rhcc-export:%'
     GROUP BY c.name
     ORDER BY n DESC`,
  );
  console.log("\nFINAL:");
  for (const r of rows) console.log(`  ${r.name}: ${r.n}`);
}

main().finally(() => prisma.$disconnect());

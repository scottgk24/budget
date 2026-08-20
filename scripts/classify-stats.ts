import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";

const u = new URL(process.env.DATABASE_URL!);
u.searchParams.set("connection_limit", "3");
u.searchParams.set("pool_timeout", "60");
const prisma = new PrismaClient({ datasources: { db: { url: u.toString() } } });

async function main() {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string; n: number }>>(
    `SELECT COALESCE(c.name, '(none)') as name, COUNT(*)::int as n
     FROM "Transaction" t
     LEFT JOIN "Category" c ON c.id = t."categoryId"
     WHERE t."plaidTransactionId" LIKE 'export:%'
        OR t."plaidTransactionId" LIKE 'rhcc-export:%'
     GROUP BY c.name
     ORDER BY n DESC`,
  );
  console.log("FINAL imported category counts:");
  let total = 0;
  for (const r of rows) {
    console.log(`  ${r.name}: ${r.n}`);
    total += r.n;
  }
  console.log("total", total);

  const review = await prisma.$queryRawUnsafe<Array<{ merchant: string; n: number }>>(
    `SELECT LEFT(COALESCE(t."merchantName", t.name), 45) as merchant, COUNT(*)::int as n
     FROM "Transaction" t
     JOIN "Category" c ON c.id = t."categoryId"
     WHERE c.name = 'Review'
       AND (t."plaidTransactionId" LIKE 'export:%' OR t."plaidTransactionId" LIKE 'rhcc-export:%')
     GROUP BY 1
     ORDER BY n DESC
     LIMIT 25`,
  );
  console.log("\nTop Review merchants:");
  for (const r of review) console.log(`  ${r.n}x ${r.merchant}`);
}

main().finally(() => prisma.$disconnect());

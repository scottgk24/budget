import { PrismaClient } from "@prisma/client";
import { isProductionRuntime } from "@/lib/runtime";

function assertDatabaseConfig() {
  const url = process.env.DATABASE_URL ?? "";
  if (isProductionRuntime() && url.startsWith("file:")) {
    throw new Error(
      "Production requires a Postgres DATABASE_URL (not a SQLite file: URL). See docs/DEPLOY.md.",
    );
  }
}

assertDatabaseConfig();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

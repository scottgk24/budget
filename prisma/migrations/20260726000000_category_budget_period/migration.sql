-- AlterTable
ALTER TABLE "Category" ADD COLUMN "budgetPeriod" TEXT NOT NULL DEFAULT 'monthly';

-- Backfill lumpy defaults to annual
UPDATE "Category"
SET "budgetPeriod" = 'annual'
WHERE "name" IN ('Travel', 'Insurance', 'Gifts');

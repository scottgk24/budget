-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "categorySource" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "plaidDetailed" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CategoryRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ledger" TEXT NOT NULL,
    "matchField" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CategoryRule_workspaceId_ledger_idx" ON "CategoryRule"("workspaceId", "ledger");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryRule_workspaceId_ledger_matchField_matchValue_key" ON "CategoryRule"("workspaceId", "ledger", "matchField", "matchValue");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "CategoryRule" ADD CONSTRAINT "CategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

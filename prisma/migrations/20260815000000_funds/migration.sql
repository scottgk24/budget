-- CreateTable
CREATE TABLE "Fund" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ledger" TEXT NOT NULL DEFAULT 'personal',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "monthlyContribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundCover" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ledger" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "fromFundId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundCover_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "defaultFundId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "fundId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "fundSource" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Fund_workspaceId_ledger_slug_key" ON "Fund"("workspaceId", "ledger", "slug");

-- CreateIndex
CREATE INDEX "Fund_workspaceId_ledger_idx" ON "Fund"("workspaceId", "ledger");

-- CreateIndex
CREATE INDEX "FundCover_workspaceId_ledger_month_idx" ON "FundCover"("workspaceId", "ledger", "month");

-- CreateIndex
CREATE INDEX "Category_defaultFundId_idx" ON "Category"("defaultFundId");

-- CreateIndex
CREATE INDEX "Transaction_workspaceId_ledger_fundId_idx" ON "Transaction"("workspaceId", "ledger", "fundId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_defaultFundId_fkey" FOREIGN KEY ("defaultFundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "Fund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fund" ADD CONSTRAINT "Fund_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundCover" ADD CONSTRAINT "FundCover_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundCover" ADD CONSTRAINT "FundCover_fromFundId_fkey" FOREIGN KEY ("fromFundId") REFERENCES "Fund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ledger" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "assets" DOUBLE PRECISION NOT NULL,
    "liabilities" DOUBLE PRECISION NOT NULL,
    "net" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NetWorthSnapshot_workspaceId_ledger_date_idx" ON "NetWorthSnapshot"("workspaceId", "ledger", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_workspaceId_ledger_date_key" ON "NetWorthSnapshot"("workspaceId", "ledger", "date");

-- AddForeignKey
ALTER TABLE "NetWorthSnapshot" ADD CONSTRAINT "NetWorthSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

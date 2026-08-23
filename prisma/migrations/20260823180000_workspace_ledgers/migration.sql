-- CreateTable
CREATE TABLE "WorkspaceLedger" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceLedger_workspaceId_idx" ON "WorkspaceLedger"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceLedger_workspaceId_slug_key" ON "WorkspaceLedger"("workspaceId", "slug");

-- AddForeignKey
ALTER TABLE "WorkspaceLedger" ADD CONSTRAINT "WorkspaceLedger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

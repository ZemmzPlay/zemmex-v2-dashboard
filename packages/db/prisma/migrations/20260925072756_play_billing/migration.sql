-- AlterEnum
ALTER TYPE "EntryStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "playTrialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PlanPurchase" ADD COLUMN     "months" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "entryFeeMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EntryOrder" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "feeMinor" INTEGER NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "processingMinor" INTEGER NOT NULL DEFAULT 0,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerSession" TEXT,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "EntryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntryOrder_entryId_key" ON "EntryOrder"("entryId");

-- CreateIndex
CREATE INDEX "EntryOrder_tournamentId_status_idx" ON "EntryOrder"("tournamentId", "status");

-- AddForeignKey
ALTER TABLE "EntryOrder" ADD CONSTRAINT "EntryOrder_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;


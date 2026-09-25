-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "eventCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planEndsAt" TIMESTAMP(3),
ADD COLUMN     "planReminder" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PlanPurchase" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "amountMinor" INTEGER NOT NULL,
    "vatMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "providerSession" TEXT,
    "providerRef" TEXT,
    "byLabel" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),

    CONSTRAINT "PlanPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanPurchase_organisationId_createdAt_idx" ON "PlanPurchase"("organisationId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlanPurchase" ADD CONSTRAINT "PlanPurchase_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Organisations already active keep going for a year from activation.
UPDATE "Organisation" SET "planEndsAt" = COALESCE("activatedAt", NOW()) + INTERVAL '1 year' WHERE "planStatus" = 'ACTIVE' AND "planEndsAt" IS NULL;

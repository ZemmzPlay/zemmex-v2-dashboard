-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "feePassedOn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "refundHours" INTEGER,
ADD COLUMN     "vatBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "providerSession" TEXT,
ADD COLUMN     "refundedMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatMinor" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "legalName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutAccountName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutBankName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutIban" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutSwift" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "vatNumber" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "paidMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "registrationIds" TEXT[],
    "amountMinor" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "failure" TEXT NOT NULL DEFAULT '',
    "requestedBy" TEXT NOT NULL,
    "byLabel" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "reference" TEXT NOT NULL DEFAULT '',
    "byLabel" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Payout_organisationId_currency_idx" ON "Payout"("organisationId", "currency");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill what each existing paid ticket cost, so it can be refunded.
UPDATE "Registration" r
SET "paidMinor" = t."priceMinor" - ROUND(t."priceMinor" * COALESCE(p."percentOff", 0) / 100.0)::int
FROM "Order" o
JOIN "TicketType" t ON TRUE
LEFT JOIN "PromoCode" p ON p.id = o."promoCodeId"
WHERE r."orderId" = o.id AND t.id = r."ticketTypeId" AND o.status = 'PAID';

-- CreateTable
CREATE TABLE "OfflineScan" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfflineScan_sessionId_idx" ON "OfflineScan"("sessionId");


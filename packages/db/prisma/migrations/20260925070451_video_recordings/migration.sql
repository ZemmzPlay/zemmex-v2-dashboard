-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'VIDEO';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "recordingAssetId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Session_recordingAssetId_key" ON "Session"("recordingAssetId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_recordingAssetId_fkey" FOREIGN KEY ("recordingAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;


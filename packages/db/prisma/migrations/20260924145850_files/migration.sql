-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('LOGO', 'PERSON_PHOTO', 'GALLERY_PHOTO', 'SLIDES');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "logoAssetId" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "photoAssetId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "recordingUrl" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "slidesAssetId" TEXT;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" "AssetKind" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "attendeesOnly" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Asset_key_key" ON "Asset"("key");

-- CreateIndex
CREATE INDEX "Asset_eventId_kind_idx" ON "Asset"("eventId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Event_logoAssetId_key" ON "Event"("logoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_photoAssetId_key" ON "Person"("photoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_slidesAssetId_key" ON "Session"("slidesAssetId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_slidesAssetId_fkey" FOREIGN KEY ("slidesAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_photoAssetId_fkey" FOREIGN KEY ("photoAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;


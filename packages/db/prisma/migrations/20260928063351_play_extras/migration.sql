-- AlterTable
ALTER TABLE "PlayPlayer" ADD COLUMN     "discordId" TEXT,
ADD COLUMN     "discordName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "googleId" TEXT;

-- AlterTable
ALTER TABLE "PlayProject" ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "domainToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "domainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "fontAr" TEXT NOT NULL DEFAULT 'plex',
ADD COLUMN     "fontEn" TEXT NOT NULL DEFAULT 'sora',
ADD COLUMN     "signInMethods" TEXT[] DEFAULT ARRAY['email', 'phone']::TEXT[],
ADD COLUMN     "theme" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "PlayerSession" ADD COLUMN     "device" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "method" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PlayProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandingTable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tournamentId" TEXT,
    "title" TEXT NOT NULL,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "qualify" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "ar" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandingTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayProjectMember_projectId_userId_key" ON "PlayProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "StandingTable_projectId_idx" ON "StandingTable"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayPlayer_projectId_googleId_key" ON "PlayPlayer"("projectId", "googleId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayPlayer_projectId_discordId_key" ON "PlayPlayer"("projectId", "discordId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayProject_customDomain_key" ON "PlayProject"("customDomain");

-- AddForeignKey
ALTER TABLE "PlayProjectMember" ADD CONSTRAINT "PlayProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PlayProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayProjectMember" ADD CONSTRAINT "PlayProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandingTable" ADD CONSTRAINT "StandingTable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PlayProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


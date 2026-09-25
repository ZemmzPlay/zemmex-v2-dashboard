-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS');

-- CreateEnum
CREATE TYPE "TournamentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Verification" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('REGISTERED', 'CHECKED_IN', 'WITHDRAWN', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PENDING', 'READY', 'REVIEW', 'CONFLICT', 'PROOF', 'CONFIRMED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Plan" ADD VALUE 'PLAY_CLUB';
ALTER TYPE "Plan" ADD VALUE 'PLAY_SEASON';
ALTER TYPE "Plan" ADD VALUE 'PLAY_PUBLISHER';

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "playPlan" "Plan",
ADD COLUMN     "playPlanEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlayProject" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "colour" TEXT NOT NULL DEFAULT '#3B25E5',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "siteLanguage" "SiteLanguage" NOT NULL DEFAULT 'BOTH',
    "heroTitle" TEXT NOT NULL DEFAULT '',
    "heroText" TEXT NOT NULL DEFAULT '',
    "countdownLabel" TEXT NOT NULL DEFAULT '',
    "countdownAt" TIMESTAMP(3),
    "rulesHtml" TEXT NOT NULL DEFAULT '',
    "faqHtml" TEXT NOT NULL DEFAULT '',
    "socials" JSONB NOT NULL DEFAULT '{}',
    "sponsors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoAssetId" TEXT,
    "ar" JSONB NOT NULL DEFAULT '{}',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT '',
    "format" "TournamentFormat" NOT NULL DEFAULT 'SINGLE_ELIMINATION',
    "teamSize" INTEGER NOT NULL DEFAULT 1,
    "capacity" INTEGER NOT NULL DEFAULT 64,
    "status" "TournamentStatus" NOT NULL DEFAULT 'DRAFT',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "regOpensAt" TIMESTAMP(3) NOT NULL,
    "regClosesAt" TIMESTAMP(3) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "bestOf" INTEGER NOT NULL DEFAULT 3,
    "playersReport" BOOLEAN NOT NULL DEFAULT true,
    "verifiedOnly" BOOLEAN NOT NULL DEFAULT false,
    "checkIn" BOOLEAN NOT NULL DEFAULT false,
    "countries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT NOT NULL DEFAULT '',
    "rulesHtml" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "prizes" JSONB NOT NULL DEFAULT '[]',
    "swissRounds" INTEGER NOT NULL DEFAULT 0,
    "currentRound" INTEGER NOT NULL DEFAULT 0,
    "bannerAssetId" TEXT,
    "ar" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayPlayer" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gamerTag" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "verification" "Verification" NOT NULL DEFAULT 'PENDING',
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "PlayPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSession" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCode" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "captainId" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL DEFAULT '',
    "seed" INTEGER,
    "status" "EntryStatus" NOT NULL DEFAULT 'REGISTERED',
    "place" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryMember" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "bracket" TEXT NOT NULL DEFAULT 'W',
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL DEFAULT '',
    "entryAId" TEXT,
    "entryBId" TEXT,
    "aBye" BOOLEAN NOT NULL DEFAULT false,
    "bBye" BOOLEAN NOT NULL DEFAULT false,
    "scoreA" INTEGER,
    "scoreB" INTEGER,
    "winnerId" TEXT,
    "status" "MatchStatus" NOT NULL DEFAULT 'PENDING',
    "nextMatchId" TEXT,
    "nextSlot" TEXT,
    "loserMatchId" TEXT,
    "loserSlot" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "confirmedBy" TEXT NOT NULL DEFAULT '',
    "confirmedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreReport" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "scoreA" INTEGER NOT NULL,
    "scoreB" INTEGER NOT NULL,
    "screenshotAssetId" TEXT,
    "replaced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeAward" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "entryId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3),
    "reference" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PrizeAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayActivity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayProject_slug_key" ON "PlayProject"("slug");

-- CreateIndex
CREATE INDEX "PlayProject_organisationId_idx" ON "PlayProject"("organisationId");

-- CreateIndex
CREATE INDEX "Tournament_projectId_status_idx" ON "Tournament"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Tournament_projectId_slug_key" ON "Tournament"("projectId", "slug");

-- CreateIndex
CREATE INDEX "PlayPlayer_projectId_verification_idx" ON "PlayPlayer"("projectId", "verification");

-- CreateIndex
CREATE UNIQUE INDEX "PlayPlayer_projectId_email_key" ON "PlayPlayer"("projectId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "PlayPlayer_projectId_gamerTag_key" ON "PlayPlayer"("projectId", "gamerTag");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSession_tokenHash_key" ON "PlayerSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PlayerCode_projectId_target_idx" ON "PlayerCode"("projectId", "target");

-- CreateIndex
CREATE INDEX "Entry_tournamentId_status_idx" ON "Entry"("tournamentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_tournamentId_name_key" ON "Entry"("tournamentId", "name");

-- CreateIndex
CREATE INDEX "EntryMember_playerId_idx" ON "EntryMember"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "EntryMember_entryId_playerId_key" ON "EntryMember"("entryId", "playerId");

-- CreateIndex
CREATE INDEX "Match_tournamentId_bracket_round_idx" ON "Match"("tournamentId", "bracket", "round");

-- CreateIndex
CREATE INDEX "Match_tournamentId_status_idx" ON "Match"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "ScoreReport_matchId_idx" ON "ScoreReport"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeAward_tournamentId_place_entryId_key" ON "PrizeAward"("tournamentId", "place", "entryId");

-- CreateIndex
CREATE INDEX "PlayActivity_projectId_createdAt_idx" ON "PlayActivity"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayProject" ADD CONSTRAINT "PlayProject_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PlayProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayPlayer" ADD CONSTRAINT "PlayPlayer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PlayProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSession" ADD CONSTRAINT "PlayerSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryMember" ADD CONSTRAINT "EntryMember_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryMember" ADD CONSTRAINT "EntryMember_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreReport" ADD CONSTRAINT "ScoreReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreReport" ADD CONSTRAINT "ScoreReport_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeAward" ADD CONSTRAINT "PrizeAward_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayActivity" ADD CONSTRAINT "PlayActivity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "PlayProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;


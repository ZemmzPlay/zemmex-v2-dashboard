-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "customDomainToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "customDomainVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organisation" ADD COLUMN     "ssoDefaultRole" "Role" NOT NULL DEFAULT 'EDITOR',
ADD COLUMN     "ssoDomain" TEXT,
ADD COLUMN     "ssoDomainToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ssoDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "ssoRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserIdentity_userId_idx" ON "UserIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserIdentity_provider_subject_key" ON "UserIdentity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "Event_customDomain_key" ON "Event"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_ssoDomain_key" ON "Organisation"("ssoDomain");

-- AddForeignKey
ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


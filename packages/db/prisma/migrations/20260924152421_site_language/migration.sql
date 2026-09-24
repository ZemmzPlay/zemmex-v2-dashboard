-- CreateEnum
CREATE TYPE "SiteLanguage" AS ENUM ('EN', 'AR', 'BOTH');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "siteLanguage" "SiteLanguage" NOT NULL DEFAULT 'EN';

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';


-- AlterTable
ALTER TABLE "AfterEventPage" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "FormField" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "MessageTemplate" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "SitePage" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "TicketType" ADD COLUMN     "ar" JSONB NOT NULL DEFAULT '{}';


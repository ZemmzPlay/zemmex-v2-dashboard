-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "navHidden" TEXT[] DEFAULT ARRAY[]::TEXT[];

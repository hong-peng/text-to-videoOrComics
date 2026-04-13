-- AlterTable
ALTER TABLE "Shot" ADD COLUMN     "videoStatus" TEXT DEFAULT 'pending',
ADD COLUMN     "videoTaskId" TEXT,
ADD COLUMN     "videoUrl" TEXT;

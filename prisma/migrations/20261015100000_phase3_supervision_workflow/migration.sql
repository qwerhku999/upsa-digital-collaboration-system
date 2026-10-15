-- AlterTable
ALTER TABLE "Feedback"
ADD COLUMN "strengths" TEXT,
ADD COLUMN "areasForImprovement" TEXT,
ADD COLUMN "nextSteps" TEXT;

-- CreateTable
CREATE TABLE "SupervisionMeeting" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "meetingAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "actionItems" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupervisionMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupervisionMeeting_projectId_meetingAt_idx" ON "SupervisionMeeting"("projectId", "meetingAt");

-- AddForeignKey
ALTER TABLE "SupervisionMeeting" ADD CONSTRAINT "SupervisionMeeting_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupervisionMeeting" ADD CONSTRAINT "SupervisionMeeting_recordedById_fkey"
FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

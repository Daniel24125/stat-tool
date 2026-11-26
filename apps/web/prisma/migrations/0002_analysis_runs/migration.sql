-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('OUTLIERS', 'COMPARE', 'REGRESSION', 'CORRELATION');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "type" "AnalysisType" NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "excludeRows" INTEGER[],
    "exclusions" INTEGER[],
    "exclusionsConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "sourceRunId" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "results" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisRun_datasetId_createdAt_idx" ON "AnalysisRun"("datasetId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_projectId_idx" ON "AnalysisRun"("projectId");

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


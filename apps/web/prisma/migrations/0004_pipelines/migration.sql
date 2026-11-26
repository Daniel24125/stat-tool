-- AlterTable
ALTER TABLE "AnalysisRun" ADD COLUMN     "pipelineRunId" TEXT,
ADD COLUMN     "stepIndex" INTEGER;

-- CreateTable
CREATE TABLE "Pipeline" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'QUEUED',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "excludedRows" INTEGER[],
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pipeline_projectId_idx" ON "Pipeline"("projectId");

-- CreateIndex
CREATE INDEX "PipelineRun_pipelineId_createdAt_idx" ON "PipelineRun"("pipelineId", "createdAt");

-- CreateIndex
CREATE INDEX "PipelineRun_datasetId_idx" ON "PipelineRun"("datasetId");

-- CreateIndex
CREATE INDEX "AnalysisRun_pipelineRunId_idx" ON "AnalysisRun"("pipelineRunId");

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_pipelineRunId_fkey" FOREIGN KEY ("pipelineRunId") REFERENCES "PipelineRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


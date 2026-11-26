-- CreateTable
CREATE TABLE "PipelineTemplate" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PipelineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipelineTemplate_ownerId_idx" ON "PipelineTemplate"("ownerId");

-- AddForeignKey
ALTER TABLE "PipelineTemplate" ADD CONSTRAINT "PipelineTemplate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


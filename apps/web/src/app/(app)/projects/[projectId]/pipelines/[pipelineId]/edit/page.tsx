import Link from "next/link";
import { notFound } from "next/navigation";
import { PipelineBuilder, type Step } from "@/components/pipeline-builder";
import { datasetColumns } from "@/lib/dataset-columns";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";

export default async function EditPipelinePage({ params }: { params: Promise<{ projectId: string; pipelineId: string }> }) {
  const { projectId, pipelineId } = await params;
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  const p = await db.pipeline.findFirst({ where: { id: pipelineId, projectId } });
  if (!p) notFound();
  return (
    <div className="max-w-4xl">
      <Link href={`/projects/${projectId}/pipelines/${p.id}`} className="text-sm text-slate-500 hover:text-slate-800">← {p.name}</Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold">Edit pipeline</h1>
      <PipelineBuilder projectId={projectId} datasets={await datasetColumns(projectId)}
        pipeline={{ id: p.id, name: p.name, description: p.description, steps: p.steps as unknown as Step[] }} />
    </div>
  );
}

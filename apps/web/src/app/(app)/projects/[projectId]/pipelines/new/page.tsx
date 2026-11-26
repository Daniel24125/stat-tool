import Link from "next/link";
import { PipelineBuilder } from "@/components/pipeline-builder";
import { datasetColumns } from "@/lib/dataset-columns";
import { requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";

export default async function NewPipelinePage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  return (
    <div className="max-w-4xl">
      <Link href={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-800">← Project</Link>
      <h1 className="mb-6 mt-1 text-2xl font-semibold">New pipeline</h1>
      <PipelineBuilder projectId={projectId} datasets={await datasetColumns(projectId)} />
    </div>
  );
}

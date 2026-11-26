import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { deletePipeline } from "@/app/pipeline-actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { RunPipelineButton } from "@/components/run-pipeline-button";
import { RunStatusBadge, typeLabel } from "@/components/run-meta";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { hasRole, requireProjectRole } from "@/lib/permissions";
import type { PipelineStep } from "@/lib/pipelines";
import { currentUser } from "@/lib/session";

function describe(s: PipelineStep) {
  const p = s.params as Record<string, unknown>;
  const list = (k: string) => ((p[k] as string[]) ?? []).join(", ");
  switch (s.type) {
    case "OUTLIERS": return `${list("columns")}${p.group_by ? ` within ${p.group_by}` : ""}${s.apply_exclusions ? " · excluded from later steps" : " · report only"}`;
    case "COMPARE": return `${list("responses")} by ${((p.factors as string[]) ?? []).join(" × ")}${p.subject ? ` (repeated, ${p.subject})` : ""}`;
    case "REGRESSION": return `${p.response} ~ ${((p.predictors as string[]) ?? []).join(" + ")}${p.random_effect ? ` + (1|${p.random_effect})` : ""}`;
    case "PLS": return p.class_column ? `classes: ${p.class_column} from ${list("predictors")}` : `${list("responses")} from ${list("predictors")}`;
    default: return list("columns");
  }
}

export default async function PipelinePage({ params }: { params: Promise<{ projectId: string; pipelineId: string }> }) {
  const { projectId, pipelineId } = await params;
  const user = await currentUser();
  const membership = await requireProjectRole(projectId, user.id);
  const p = await db.pipeline.findFirst({
    where: { id: pipelineId, projectId },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 30, include: { dataset: { select: { name: true } } } } },
  });
  if (!p) notFound();
  const datasets = await db.dataset.findMany({ where: { projectId, status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
  const canEdit = hasRole(membership.role, "EDITOR");
  const steps = p.steps as unknown as PipelineStep[];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-800">← Project</Link>
          <h1 className="mt-1 text-2xl font-semibold">{p.name}</h1>
          {p.description && <p className="mt-1 text-sm text-slate-500">{p.description}</p>}
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Link href={`/projects/${projectId}/pipelines/${p.id}/edit`} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /> Edit</Link>
            <form action={deletePipeline.bind(null, projectId, p.id)}>
              <ConfirmSubmit message={`Delete pipeline "${p.name}" and its run history? Analyses it produced are deleted too.`}>Delete</ConfirmSubmit>
            </form>
          </div>
        )}
      </div>

      {canEdit && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Run every step on a dataset. The dataset must have all the columns the steps use.</p>
            <RunPipelineButton projectId={projectId} pipelineId={p.id} datasets={datasets} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Steps</CardTitle></CardHeader>
        <ol className="divide-y divide-slate-100">
          {steps.map((s, i) => (
            <li key={s.id} className="flex gap-3 px-5 py-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
              <div>
                <p className="text-sm font-medium">{s.label || typeLabel[s.type]} <Badge className="ml-1">{typeLabel[s.type]}</Badge></p>
                <p className="text-xs text-slate-500">{describe(s)}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardHeader><CardTitle>Run history</CardTitle></CardHeader>
        <ul className="divide-y divide-slate-100">
          {p.runs.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">Not run yet.</li>}
          {p.runs.map((r) => (
            <li key={r.id}>
              <Link href={`/projects/${projectId}/pipeline-runs/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                <span className="text-sm font-medium">{r.dataset.name}</span>
                <RunStatusBadge status={r.status} />
                {r.excludedRows.length > 0 && <span className="text-xs text-slate-500">{r.excludedRows.length} rows excluded</span>}
                <span className="ml-auto text-xs text-slate-500">{r.createdAt.toLocaleString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

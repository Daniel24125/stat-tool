import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { RefreshWhilePending } from "@/components/refresh-while-pending";
import { RunStatusBadge, typeLabel } from "@/components/run-meta";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import type { PipelineStep } from "@/lib/pipelines";
import { currentUser } from "@/lib/session";

export default async function PipelineRunPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const { projectId, runId } = await params;
  const user = await currentUser();
  await requireProjectRole(projectId, user.id);
  const pr = await db.pipelineRun.findFirst({
    where: { id: runId, projectId },
    include: {
      pipeline: { select: { id: true, name: true } },
      dataset: { select: { id: true, name: true } },
      createdBy: { select: { name: true, email: true } },
      analyses: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, status: true, stepIndex: true, error: true, results: true, excludeRows: true } },
    },
  });
  if (!pr) notFound();
  const steps = pr.steps as unknown as PipelineStep[];
  const pending = pr.status === "QUEUED" || pr.status === "RUNNING";

  return (
    <div className="max-w-4xl space-y-6">
      <RefreshWhilePending pending={pending} />
      <div>
        <Link href={`/projects/${projectId}/pipelines/${pr.pipeline.id}`} className="text-sm text-slate-500 hover:text-slate-800">← {pr.pipeline.name}</Link>
        <div className="mt-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{pr.pipeline.name} on {pr.dataset.name}</h1>
          <RunStatusBadge status={pr.status} />
        </div>
        <p className="mt-1 text-xs text-slate-500">by {pr.createdBy.name ?? pr.createdBy.email} · {pr.createdAt.toLocaleString()}{pr.finishedAt && ` · ${((+pr.finishedAt - +pr.createdAt) / 1000).toFixed(1)} s`}</p>
      </div>

      {pr.error && <Card className="border-amber-200 bg-amber-50/50"><CardBody className="text-sm text-amber-900">{pr.error}</CardBody></Card>}
      {pr.excludedRows.length > 0 && (
        <Card>
          <CardBody className="text-sm text-slate-700">
            <b>{pr.excludedRows.length}</b> row(s) were excluded as outliers from the steps after outlier detection (data rows {pr.excludedRows.map((r) => r + 1).join(", ")}).
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Steps</CardTitle></CardHeader>
        <ol className="divide-y divide-slate-100">
          {steps.map((s, i) => {
            const analyses = pr.analyses.filter((a) => a.stepIndex === i);
            const active = pending && pr.currentStep === i;
            const done = analyses.length > 0 && analyses.every((a) => a.status === "DONE");
            const failed = analyses.some((a) => a.status === "FAILED");
            return (
              <li key={s.id} className="flex gap-3 px-5 py-4">
                {active ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-amber-600" />
                  : failed ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                  : done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
                <div className="flex-1">
                  <p className="text-sm font-medium">{i + 1}. {s.label || typeLabel[s.type]}</p>
                  <ul className="mt-1 space-y-1">
                    {analyses.map((a) => {
                      const summary = (a.results as { summary?: string } | null)?.summary;
                      return (
                        <li key={a.id} className="text-sm">
                          <Link href={`/projects/${projectId}/runs/${a.id}`} className="text-brand-700 hover:underline">{a.name.replace(/^\d+\.\s*/, "")}</Link>
                          {a.status === "FAILED" && <span className="ml-2 text-red-700">failed: {a.error}</span>}
                          {summary && <p className="text-xs text-slate-500">{summary}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

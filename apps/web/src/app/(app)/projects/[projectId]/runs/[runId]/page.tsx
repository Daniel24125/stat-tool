import Link from "next/link";
import { notFound } from "next/navigation";
import { Loader2 } from "lucide-react";
import { RefreshWhilePending } from "@/components/refresh-while-pending";
import { CompareResult, type CompareResults } from "@/components/results/compare-result";
import { CorrelationResult, type CorrelationResults } from "@/components/results/correlation-result";
import { OutlierResult, type OutlierResults } from "@/components/results/outlier-result";
import { RegressionResult, type RegressionResults } from "@/components/results/regression-result";
import { ClusterResult, type ClusterResults } from "@/components/results/cluster-result";
import { PcaResult, type PcaResults } from "@/components/results/pca-result";
import { PlsResult, type PlsResults } from "@/components/results/pls-result";
import { RunStatusBadge, typeLabel } from "@/components/run-meta";
import { Card, CardBody } from "@/components/ui";
import { db } from "@/lib/db";
import { hasRole, requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";

export default async function RunPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const { projectId, runId } = await params;
  const user = await currentUser();
  const membership = await requireProjectRole(projectId, user.id);
  const run = await db.analysisRun.findFirst({
    where: { id: runId, projectId },
    include: { dataset: { select: { id: true, name: true } }, createdBy: { select: { name: true, email: true } } },
  });
  if (!run) notFound();
  const source = run.sourceRunId ? await db.analysisRun.findUnique({ where: { id: run.sourceRunId }, select: { id: true, name: true } }) : null;
  const pending = run.status === "QUEUED" || run.status === "RUNNING";
  const results = run.results as unknown;

  return (
    <div className="space-y-6">
      <RefreshWhilePending pending={pending} />
      <div>
        <Link href={`/projects/${projectId}/datasets/${run.dataset.id}`} className="text-sm text-slate-500 hover:text-slate-800">← {run.dataset.name}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{run.name}</h1>
          <RunStatusBadge status={run.status} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {typeLabel[run.type]} · by {run.createdBy.name ?? run.createdBy.email} · {run.createdAt.toLocaleString()}
          {run.durationMs != null && ` · ${(run.durationMs / 1000).toFixed(1)} s`}
          {source && <> · outliers excluded from <Link className="underline" href={`/projects/${projectId}/runs/${source.id}`}>{source.name}</Link></>}
        </p>
      </div>

      {pending && (
        <Card><CardBody className="flex items-center gap-3 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Running. You can leave this page; you&apos;ll get a notification when it&apos;s ready.</CardBody></Card>
      )}
      {run.status === "FAILED" && (
        <Card className="border-red-200"><CardBody className="text-sm text-red-700">{run.error}</CardBody></Card>
      )}
      {run.status === "DONE" && run.type === "COMPARE" && <CompareResult r={results as CompareResults} />}
      {run.status === "DONE" && run.type === "REGRESSION" && <RegressionResult r={results as RegressionResults} />}
      {run.status === "DONE" && run.type === "CORRELATION" && <CorrelationResult r={results as CorrelationResults} />}
      {run.status === "DONE" && run.type === "PCA" && <PcaResult r={results as PcaResults} />}
      {run.status === "DONE" && run.type === "PLS" && <PlsResult r={results as PlsResults} />}
      {run.status === "DONE" && run.type === "CLUSTER" && <ClusterResult r={results as ClusterResults} />}
      {run.status === "DONE" && run.type === "OUTLIERS" && (
        <OutlierResult r={results as OutlierResults} projectId={projectId} runId={run.id} canEdit={hasRole(membership.role, "EDITOR")}
          saved={run.exclusions} confirmed={run.exclusionsConfirmed} />
      )}
    </div>
  );
}

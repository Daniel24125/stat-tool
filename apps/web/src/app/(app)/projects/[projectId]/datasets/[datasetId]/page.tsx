import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteDataset } from "@/app/actions";
import { AnalysisForm } from "@/components/analysis-form";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ProfileView } from "@/components/profile-view";
import { RefreshWhilePending } from "@/components/refresh-while-pending";
import { RunStatusBadge, typeLabel } from "@/components/run-meta";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui";
import { db } from "@/lib/db";
import { hasRole, requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";
import type { Profile } from "@/lib/types";

export default async function DatasetPage({ params }: { params: Promise<{ projectId: string; datasetId: string }> }) {
  const { projectId, datasetId } = await params;
  const user = await currentUser();
  const membership = await requireProjectRole(projectId, user.id);
  const dataset = await db.dataset.findFirst({
    where: { id: datasetId, projectId },
    include: { project: true, runs: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true, email: true } } } } },
  });
  if (!dataset) notFound();
  const canEdit = hasRole(membership.role, "EDITOR");
  const profile = dataset.profile as unknown as Profile | null;
  const outlierRuns = dataset.runs
    .filter((r) => r.type === "OUTLIERS" && r.exclusionsConfirmed)
    .map((r) => ({ id: r.id, name: r.name, count: r.exclusions.length }));
  const pending = dataset.runs.some((r) => r.status === "QUEUED" || r.status === "RUNNING");

  return (
    <div>
      <RefreshWhilePending pending={pending} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-800">← {dataset.project.name}</Link>
          <h1 className="mt-1 text-2xl font-semibold">{dataset.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {dataset.fileName} · {(dataset.sizeBytes / 1024).toFixed(1)} KB · SHA-256 {dataset.sha256.slice(0, 12)}…
          </p>
        </div>
        {canEdit && (
          <form action={deleteDataset.bind(null, projectId, datasetId)}>
            <ConfirmSubmit message={`Delete dataset "${dataset.name}" and its analyses? This cannot be undone.`}>Delete dataset</ConfirmSubmit>
          </form>
        )}
      </div>

      {dataset.status === "READY" && profile ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <div className="order-2 xl:order-1"><ProfileView profile={profile} /></div>
          <div className="order-1 space-y-6 xl:order-2">
            {canEdit && (
              <Card>
                <CardHeader><CardTitle>New analysis</CardTitle></CardHeader>
                <CardBody><AnalysisForm projectId={projectId} datasetId={datasetId} columns={profile.columns} outlierRuns={outlierRuns} /></CardBody>
              </Card>
            )}
            <Card>
              <CardHeader><CardTitle>Analyses ({dataset.runs.length})</CardTitle></CardHeader>
              <ul className="divide-y divide-slate-100">
                {dataset.runs.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">No analyses yet.</li>}
                {dataset.runs.map((r) => (
                  <li key={r.id}>
                    <Link href={`/projects/${projectId}/runs/${r.id}`} className="block px-5 py-3 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-800">{r.name}</span>
                        <RunStatusBadge status={r.status} />
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <Badge>{typeLabel[r.type]}</Badge>
                        {r.excludeRows.length > 0 && <span>{r.excludeRows.length} rows excluded</span>}
                        <span className="ml-auto">{r.createdAt.toLocaleString()}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      ) : (
        <Card className="mt-6">
          <CardBody>
            <Badge tone={dataset.status === "FAILED" ? "red" : "amber"}>{dataset.status.toLowerCase()}</Badge>
            {dataset.error && <p className="mt-2 text-sm text-red-700">{dataset.error}</p>}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

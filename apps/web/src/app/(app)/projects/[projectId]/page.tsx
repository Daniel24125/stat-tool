import Link from "next/link";
import { FileSpreadsheet, Plus, Settings, Workflow } from "lucide-react";
import { UploadDataset } from "@/components/upload-dataset";
import { Badge, Card, EmptyState } from "@/components/ui";
import { db } from "@/lib/db";
import { hasRole, requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";

const statusTone = { READY: "green", PROFILING: "amber", FAILED: "red" } as const;

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await currentUser();
  const membership = await requireProjectRole(projectId, user.id);
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      datasets: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true, email: true } } } },
      pipelines: { orderBy: { updatedAt: "desc" }, include: { _count: { select: { runs: true } } } },
    },
  });
  const canEdit = hasRole(membership.role, "EDITOR");

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-800">← Projects</Link>
          <h1 className="mt-1 text-3xl">{project.name}</h1>
          {project.description && <p className="mt-1 text-sm text-slate-500">{project.description}</p>}
        </div>
        <Link href={`/projects/${projectId}/settings`} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <Settings className="h-4 w-4" /> {membership.role === "OWNER" ? "Members & settings" : "Members"}
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Datasets</h2>
      {canEdit && <div className="mt-3"><UploadDataset projectId={projectId} /></div>}

      <div className="mt-4">
        {project.datasets.length === 0 ? (
          <EmptyState title="No datasets yet">{canEdit ? "Upload a file to get an automatic profile." : "Viewers can't upload data."}</EmptyState>
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-5 py-3">Name</th><th>Size</th><th>Status</th><th>Uploaded by</th><th>Date</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {project.datasets.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/projects/${projectId}/datasets/${d.id}`} className="flex items-center gap-2 font-medium text-slate-800 hover:text-brand-700">
                        <FileSpreadsheet className="h-4 w-4 text-slate-400" /> {d.name}
                      </Link>
                    </td>
                    <td className="text-slate-600">{d.nRows != null ? `${d.nRows} × ${d.nCols}` : "—"}</td>
                    <td><Badge tone={statusTone[d.status]}>{d.status.toLowerCase()}</Badge></td>
                    <td className="text-slate-600">{d.createdBy.name ?? d.createdBy.email}</td>
                    <td className="text-slate-500">{d.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pipelines</h2>
        {canEdit && <Link href={`/projects/${projectId}/pipelines/new`} className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"><Plus className="h-4 w-4" /> New pipeline</Link>}
      </div>
      <p className="text-sm text-slate-500">Reusable sequences of steps (outliers → significance → multivariate) you can run on any dataset with the same columns.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {project.pipelines.length === 0 && <p className="text-sm text-slate-400">No pipelines yet.</p>}
        {project.pipelines.map((p) => (
          <Link key={p.id} href={`/projects/${projectId}/pipelines/${p.id}`}>
            <Card className="h-full transition hover:border-brand-500/50">
              <div className="px-4 py-3">
                <p className="flex items-center gap-2 font-medium"><Workflow className="h-4 w-4 text-brand-600" /> {p.name}</p>
                <p className="mt-1 text-xs text-slate-500">{(p.steps as unknown[]).length} steps · {p._count.runs} runs</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

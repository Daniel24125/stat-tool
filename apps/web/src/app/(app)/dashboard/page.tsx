import Link from "next/link";
import { Database, FolderOpen, Users } from "lucide-react";
import { createProject } from "@/app/actions";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, EmptyState, Input } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";

const roleTone = { OWNER: "blue", EDITOR: "green", VIEWER: "slate" } as const;

export default async function Dashboard() {
  const user = await currentUser();
  const [memberships, notifications] = await Promise.all([
    db.projectMember.findMany({
      where: { userId: user.id },
      include: { project: { include: { _count: { select: { datasets: true, members: true } } } } },
      orderBy: { project: { updatedAt: "desc" } },
    }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-2xl font-semibold">Projects</h1>
        <p className="mt-1 text-sm text-slate-500">Projects hold datasets, pipelines and results shared with their members.</p>

        <form action={createProject} className="mt-6 flex gap-2">
          <Input name="name" placeholder="New project name" required maxLength={120} />
          <Button type="submit">Create</Button>
        </form>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {memberships.length === 0 && (
            <div className="sm:col-span-2">
              <EmptyState title="No projects yet">Create one above, or ask a colleague to add you to theirs.</EmptyState>
            </div>
          )}
          {memberships.map(({ project, role }) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="h-full transition hover:border-brand-500/50 hover:shadow">
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium">
                      <FolderOpen className="h-4 w-4 text-brand-600" /> {project.name}
                    </div>
                    <Badge tone={roleTone[role]}>{role.toLowerCase()}</Badge>
                  </div>
                  {project.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{project.description}</p>}
                  <div className="mt-4 flex gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Database className="h-3.5 w-3.5" /> {project._count.datasets} datasets</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {project._count.members} members</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <aside>
        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
          <ul className="divide-y divide-slate-100">
            {notifications.length === 0 && <li className="px-5 py-4 text-sm text-slate-500">No activity yet.</li>}
            {notifications.map((n) => (
              <li key={n.id} className="px-5 py-3">
                <Link href={n.href ?? "#"} className="text-sm text-slate-700 hover:text-brand-700">{n.message}</Link>
                <p className="text-xs text-slate-400">{n.createdAt.toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </div>
  );
}

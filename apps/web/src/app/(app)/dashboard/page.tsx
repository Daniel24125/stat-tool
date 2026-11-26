import Link from "next/link";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { Badge, EmptyState } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILT_IN_TEMPLATES, type TemplateDef, type TemplateStep } from "@/lib/templates";

const roleTone = { OWNER: "blue", EDITOR: "green", VIEWER: "slate" } as const;

function ago(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return d.toLocaleDateString();
}

export default async function Dashboard() {
  const user = await currentUser();
  const [memberships, notifications, mine] = await Promise.all([
    db.projectMember.findMany({
      where: { userId: user.id },
      include: { project: { include: { _count: { select: { datasets: true, members: true, runs: true } } } } },
      orderBy: { project: { updatedAt: "desc" } },
    }),
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.pipelineTemplate.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" } }),
  ]);
  const templates: TemplateDef[] = [
    ...mine.map((t) => ({ id: t.id, name: t.name, description: t.description ?? "", steps: t.steps as unknown as TemplateStep[] })),
    ...BUILT_IN_TEMPLATES,
  ];
  const firstName = user.name?.split(" ")[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl">{firstName ? `${firstName}'s projects` : "Your projects"}</h1>
            <p className="mt-1 text-sm text-slate-500">Each project holds datasets, analyses and the people working on them.</p>
          </div>
          <NewProjectDialog templates={templates} />
        </div>

        {memberships.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No projects yet">Create one with your first dataset, or ask a colleague to add you to theirs.</EmptyState>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-rule/70 rounded-[var(--radius-panel)] border border-rule bg-white">
            {memberships.map(({ project, role }) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 px-5 py-4 hover:bg-paper/70 sm:grid-cols-[1fr_repeat(3,5.5rem)_5rem]">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{project.name}</span>
                    <span className="block truncate text-xs text-slate-500">{project.description || `Updated ${ago(project.updatedAt)}`}</span>
                  </span>
                  <span className="hidden text-right text-sm text-slate-600 sm:block"><b className="font-semibold text-ink">{project._count.datasets}</b> data</span>
                  <span className="hidden text-right text-sm text-slate-600 sm:block"><b className="font-semibold text-ink">{project._count.runs}</b> analyses</span>
                  <span className="hidden text-right text-sm text-slate-600 sm:block"><b className="font-semibold text-ink">{project._count.members}</b> people</span>
                  <span className="text-right"><Badge tone={roleTone[role]}>{role.toLowerCase()}</Badge></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside>
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <ul className="mt-3 space-y-4 border-l border-rule pl-4">
          {notifications.length === 0 && <li className="text-sm text-slate-500">Nothing yet. Finished analyses and invitations appear here.</li>}
          {notifications.map((n) => (
            <li key={n.id} className="relative">
              <span aria-hidden className={`absolute -left-[20.5px] top-1.5 h-2 w-2 rounded-full ${n.readAt ? "bg-rule" : "bg-brand-600"}`} />
              <Link href={n.href ?? "#"} className="text-sm leading-snug text-slate-700 hover:text-brand-700">{n.message}</Link>
              <p className="text-xs text-slate-400">{ago(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

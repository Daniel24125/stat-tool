import Link from "next/link";
import { deleteProject } from "@/app/actions";
import { MembersPanel } from "@/components/members-panel";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";

export default async function SettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const user = await currentUser();
  const membership = await requireProjectRole(projectId, user.id);
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { members: { include: { user: true }, orderBy: { addedAt: "asc" } } },
  });
  const isOwner = membership.role === "OWNER";
  const members = project.members.map((m) => ({
    userId: m.userId, role: m.role, name: m.user.name, email: m.user.email, picture: m.user.picture,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-slate-500 hover:text-slate-800">← {project.name}</Link>
        <h1 className="mt-1 text-2xl font-semibold">Members</h1>
      </div>
      <Card>
        <CardHeader><CardTitle>People with access</CardTitle></CardHeader>
        <CardBody><MembersPanel projectId={projectId} members={members} meId={user.id} isOwner={isOwner} /></CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
        <CardBody className="text-sm text-slate-600">
          <p><b>Viewer</b>: sees datasets and results. <b>Editor</b>: also uploads data and runs analyses. <b>Owner</b>: also manages members and can delete the project.</p>
        </CardBody>
      </Card>
      {isOwner && (
        <Card className="border-red-200">
          <CardHeader><CardTitle className="text-red-700">Delete project</CardTitle></CardHeader>
          <CardBody className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-600">Permanently deletes the project, its datasets and stored files for all members.</p>
            <form action={deleteProject.bind(null, projectId)}>
              <ConfirmSubmit message={`Delete "${project.name}" and all its data? This cannot be undone.`}>Delete</ConfirmSubmit>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

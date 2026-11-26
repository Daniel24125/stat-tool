import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteTemplate } from "@/app/template-actions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { TemplateEditor } from "@/components/template-editor";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import type { TemplateStep } from "@/lib/templates";

export default async function EditTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const user = await currentUser();
  const t = await db.pipelineTemplate.findFirst({ where: { id: templateId, ownerId: user.id } });
  if (!t) notFound();
  return (
    <div className="max-w-3xl">
      <Link href="/templates" className="text-sm text-slate-500 hover:text-ink">Templates</Link>
      <div className="mb-6 mt-1 flex items-center justify-between gap-4">
        <h1 className="text-3xl">{t.name}</h1>
        <form action={deleteTemplate.bind(null, t.id)}>
          <ConfirmSubmit message={`Delete template "${t.name}"? Pipelines already created from it are not affected.`}>Delete template</ConfirmSubmit>
        </form>
      </div>
      <TemplateEditor template={{ id: t.id, name: t.name, description: t.description, steps: t.steps as unknown as TemplateStep[] }} />
    </div>
  );
}

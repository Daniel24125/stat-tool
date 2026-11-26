import Link from "next/link";
import { Copy, Plus } from "lucide-react";
import { duplicateTemplate } from "@/app/template-actions";
import { buttonVariants } from "@/components/ui";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILT_IN_TEMPLATES, STEP_INFO, type TemplateDef, type TemplateStep } from "@/lib/templates";

function StepFlow({ steps }: { steps: TemplateStep[] }) {
  return (
    <ol className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="h-px w-3 bg-rule" />}
          <span className="rounded-full border border-rule bg-paper px-2 py-0.5 text-slate-700">{s.label || STEP_INFO[s.type].label}</span>
        </li>
      ))}
    </ol>
  );
}

function TemplateRow({ t, own }: { t: TemplateDef; own: boolean }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        {own ? <Link href={`/templates/${t.id}`} className="font-medium text-ink hover:text-brand-700">{t.name}</Link> : <p className="font-medium">{t.name}</p>}
        {t.description && <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500">{t.description}</p>}
        <StepFlow steps={t.steps} />
      </div>
      <form action={duplicateTemplate.bind(null, t.id)}>
        <button className={buttonVariants({ variant: "ghost", size: "sm" })}><Copy className="h-3.5 w-3.5" /> Duplicate</button>
      </form>
    </li>
  );
}

export default async function TemplatesPage() {
  const user = await currentUser();
  const mine = await db.pipelineTemplate.findMany({ where: { ownerId: user.id }, orderBy: { updatedAt: "desc" } });

  return (
    <div className="max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Pipeline templates</h1>
          <p className="mt-1 max-w-[65ch] text-sm text-slate-500">
            Templates describe an analysis in terms of responses and factors, so the same recipe works on any dataset. Pick one when you create a project.
          </p>
        </div>
        <Link href="/templates/new" className={buttonVariants()}><Plus className="h-4 w-4" /> New template</Link>
      </div>

      <h2 className="mt-8 text-sm font-semibold">Your templates</h2>
      {mine.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">None yet. Duplicate a built-in template below to start from it.</p>
      ) : (
        <ul className="mt-2 divide-y divide-rule/70 rounded-[var(--radius-panel)] border border-rule bg-white">
          {mine.map((t) => <TemplateRow key={t.id} own t={{ id: t.id, name: t.name, description: t.description ?? "", steps: t.steps as unknown as TemplateStep[] }} />)}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold">Built in</h2>
      <ul className="mt-2 divide-y divide-rule/70 rounded-[var(--radius-panel)] border border-rule bg-white">
        {BUILT_IN_TEMPLATES.map((t) => <TemplateRow key={t.id} t={t} own={false} />)}
      </ul>
    </div>
  );
}

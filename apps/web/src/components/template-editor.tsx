"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveTemplate } from "@/app/template-actions";
import { Button, Card, CardBody, Input, Label, Textarea } from "@/components/ui";
import { STEP_INFO, type TemplateStep, type TemplateStepType } from "@/lib/templates";

const uid = () => Math.random().toString(36).slice(2, 10);

export function TemplateEditor({ template }: { template?: { id: string; name: string; description: string | null; steps: TemplateStep[] } }) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [steps, setSteps] = useState<TemplateStep[]>(template?.steps ?? []);
  const [pending, start] = useTransition();
  const router = useRouter();

  const update = (i: number, patch: Partial<TemplateStep>) => setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  const move = (i: number, d: -1 | 1) => setSteps((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  function save() {
    start(async () => {
      const r = await saveTemplate({ id: template?.id, name, description, steps });
      if (r.ok) { toast.success("Template saved."); router.push("/templates"); router.refresh(); }
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-4">
          <div><Label htmlFor="t-name">Name</Label><Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fermentation batch check" /></div>
          <div><Label htmlFor="t-desc">What it's for (optional)</Label><Textarea id="t-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </CardBody>
      </Card>

      <div>
        <h2 className="text-sm font-semibold">Steps, in the order they run</h2>
        <p className="mt-0.5 text-sm text-slate-500">You choose the responses and factors when you apply the template to a dataset.</p>
        <ol className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3 rounded-[var(--radius-panel)] border border-rule bg-white px-4 py-3">
              <span className="w-5 text-right font-serif text-lg text-slate-400">{i + 1}</span>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{STEP_INFO[s.type].label}</span>
                  <Input aria-label="Step label" value={s.label ?? ""} onChange={(e) => update(i, { label: e.target.value })} placeholder="Label (optional)" className="h-7 max-w-[220px] text-xs" />
                </div>
                <p className="text-xs text-slate-500">Uses {STEP_INFO[s.type].uses}.</p>
                {s.type === "OUTLIERS" && (
                  <label className="mt-1 flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-brand-600" checked={s.apply_exclusions ?? true} onChange={(e) => update(i, { apply_exclusions: e.target.checked })} />
                    Exclude flagged rows from later steps
                  </label>
                )}
              </div>
              <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label="Remove step" onClick={() => setSteps((st) => st.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(STEP_INFO) as TemplateStepType[]).map((t) => (
            <Button key={t} variant="secondary" size="sm" onClick={() => setSteps((s) => [...s, { id: uid(), type: t, ...(t === "OUTLIERS" ? { apply_exclusions: true } : {}) }])}>
              <Plus className="h-3.5 w-3.5" /> {STEP_INFO[t].label}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex justify-end"><Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save template"}</Button></div>
    </div>
  );
}

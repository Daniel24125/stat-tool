"use client";

import { ArrowDown, ArrowUp, Plus, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { savePipeline } from "@/app/pipeline-actions";
import { Chips } from "@/components/analysis-form";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";
import type { ColumnProfile } from "@/lib/types";

type Type = "OUTLIERS" | "COMPARE" | "REGRESSION" | "CORRELATION" | "PCA" | "PLS" | "CLUSTER";
export type Step = { id: string; type: Type; label?: string; params: Record<string, unknown>; apply_exclusions?: boolean };
type DatasetCols = { id: string; name: string; columns: ColumnProfile[] };

const TYPE_LABEL: Record<Type, string> = {
  OUTLIERS: "Outlier detection", COMPARE: "Significance (compare groups)", REGRESSION: "Regression", CORRELATION: "Correlation",
  PCA: "PCA", PLS: "PLS / PLS-DA", CLUSTER: "Clustering",
};

const uid = () => Math.random().toString(36).slice(2, 10);

function emptyParams(type: Type): Record<string, unknown> {
  switch (type) {
    case "OUTLIERS": return { columns: [], group_by: null, method: "auto" };
    case "COMPARE": return { responses: [], factors: [], subject: null };
    case "REGRESSION": return { response: "", predictors: [], categorical: [], family: "auto", random_effect: null };
    case "CORRELATION": return { columns: [], method: "auto" };
    case "PCA": return { columns: [], scaling: "auto", color_by: null };
    case "PLS": return { predictors: [], responses: [], class_column: null };
    case "CLUSTER": return { columns: [], method: "auto", compare_with: null };
  }
}

export function PipelineBuilder({ projectId, pipeline, datasets }: {
  projectId: string;
  pipeline?: { id: string; name: string; description: string | null; steps: Step[] };
  datasets: DatasetCols[];
}) {
  const [name, setName] = useState(pipeline?.name ?? "");
  const [description, setDescription] = useState(pipeline?.description ?? "");
  const [steps, setSteps] = useState<Step[]>(pipeline?.steps ?? []);
  const [refId, setRefId] = useState(datasets[0]?.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  const columns = useMemo(() => datasets.find((d) => d.id === refId)?.columns ?? [], [datasets, refId]);
  const numeric = columns.filter((c) => c.kind === "numeric").map((c) => c.name);
  const factors = columns.filter((c) => ["categorical", "binary"].includes(c.kind) || (c.kind === "numeric" && c.unique <= 10)).map((c) => c.name);
  const ids = columns.filter((c) => ["identifier", "categorical", "text"].includes(c.kind)).map((c) => c.name);
  const nonNumeric = new Set(columns.filter((c) => c.kind !== "numeric").map((c) => c.name));
  const all = columns.filter((c) => c.kind !== "empty").map((c) => c.name);

  const update = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((st, j) => (j === i ? { ...st, ...patch } : st)));
  const setParam = (i: number, key: string, value: unknown) =>
    setSteps((s) => s.map((st, j) => (j === i ? { ...st, params: { ...st.params, [key]: value } } : st)));
  const move = (i: number, d: -1 | 1) => setSteps((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });

  function addStep(type: Type) {
    setSteps((s) => [...s, { id: uid(), type, params: emptyParams(type), ...(type === "OUTLIERS" ? { apply_exclusions: true } : {}) }]);
  }

  function template() {
    const fac = factors.filter((f) => !numeric.includes(f) || nonNumeric.has(f)).slice(0, 2);
    const resp = numeric.filter((n) => !fac.includes(n));
    if (!fac.length || !resp.length) return toast.error("The reference dataset needs at least one factor and one numeric column.");
    const t: Step[] = [
      { id: uid(), type: "OUTLIERS", label: "Remove outliers", params: { columns: resp, group_by: fac[0], method: "auto" }, apply_exclusions: true },
      { id: uid(), type: "COMPARE", label: "Significance", params: { responses: resp, factors: fac, subject: null } },
    ];
    if (resp.length >= 2) {
      t.push({ id: uid(), type: "CORRELATION", label: "Correlations", params: { columns: resp, method: "auto" } });
      t.push({ id: uid(), type: "PCA", label: "Multivariate overview", params: { columns: resp, scaling: "auto", color_by: fac[0] } });
    }
    setSteps(t);
    toast.success(`Template uses factor(s) ${fac.join(", ")} and ${resp.length} response(s). Adjust as needed.`);
  }

  function save() {
    // REGRESSION: non-numeric predictors are dummy-coded
    const cleaned = steps.map((s) => (s.type === "REGRESSION"
      ? { ...s, params: { ...s.params, categorical: ((s.params.predictors as string[]) ?? []).filter((p) => nonNumeric.has(p)) } }
      : s));
    start(async () => {
      const r = await savePipeline({ projectId, pipelineId: pipeline?.id, name, description, steps: cleaned });
      if (r.ok) { toast.success("Pipeline saved."); router.push(`/projects/${projectId}/pipelines/${r.pipelineId}`); router.refresh(); }
      else toast.error(r.error);
    });
  }

  const arr = (s: Step, k: string) => (s.params[k] as string[]) ?? [];
  const str = (s: Step, k: string) => (s.params[k] as string | null) ?? "";

  function fields(s: Step, i: number) {
    const opt = (k: string, list: string[], none: string) => (
      <Select value={str(s, k)} onChange={(e) => setParam(i, k, e.target.value || null)}>
        <option value="">{none}</option>
        {list.map((c) => <option key={c}>{c}</option>)}
      </Select>
    );
    switch (s.type) {
      case "OUTLIERS":
        return (<>
          <div><Label>Numeric columns</Label><Chips options={numeric} value={arr(s, "columns")} onChange={(v) => setParam(i, "columns", v)} /></div>
          <div><Label>Judge within groups of</Label>{opt("group_by", factors, "No grouping")}</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!s.apply_exclusions} onChange={(e) => update(i, { apply_exclusions: e.target.checked })} />
            Exclude the suggested outliers from all later steps
          </label>
          <p className="text-xs text-slate-500">The method is chosen automatically. Excluded rows are recorded on the pipeline run so they can be reported.</p>
        </>);
      case "COMPARE":
        return (<>
          <div><Label>Responses (one comparison each)</Label><Chips options={numeric.filter((c) => !arr(s, "factors").includes(c))} value={arr(s, "responses")} onChange={(v) => setParam(i, "responses", v)} /></div>
          <div><Label>Factors (1–3)</Label><Chips options={factors} value={arr(s, "factors")} onChange={(v) => setParam(i, "factors", v)} max={3} /></div>
          <div><Label>Subject / block for repeated measures</Label>{opt("subject", ids, "Independent groups")}</div>
        </>);
      case "REGRESSION":
        return (<>
          <div><Label>Response</Label>{opt("response", all, "Choose…")}</div>
          <div><Label>Predictors</Label><Chips options={all.filter((c) => c !== str(s, "response"))} value={arr(s, "predictors")} onChange={(v) => setParam(i, "predictors", v)} /></div>
          <div><Label>Random intercept (mixed model)</Label>{opt("random_effect", [...new Set([...ids, ...factors])], "None")}</div>
        </>);
      case "CORRELATION":
      case "CLUSTER":
      case "PCA":
        return (<>
          <div><Label>Numeric columns</Label><Chips options={numeric} value={arr(s, "columns")} onChange={(v) => setParam(i, "columns", v)} /></div>
          {s.type === "PCA" && <div><Label>Colour scores by</Label>{opt("color_by", factors, "None")}</div>}
          {s.type === "CLUSTER" && <div><Label>Compare with known groups</Label>{opt("compare_with", factors, "None")}</div>}
        </>);
      case "PLS": {
        const da = s.params.class_column !== null && s.params.class_column !== undefined;
        return (<>
          <div>
            <Label>Goal</Label>
            <Select value={da ? "da" : "pls"} onChange={(e) => update(i, { params: { ...s.params, class_column: e.target.value === "da" ? "" : null, responses: [] } })}>
              <option value="pls">Predict numeric response(s)</option>
              <option value="da">Discriminate classes (PLS-DA)</option>
            </Select>
          </div>
          <div><Label>Predictors (X)</Label><Chips options={numeric.filter((c) => !arr(s, "responses").includes(c))} value={arr(s, "predictors")} onChange={(v) => setParam(i, "predictors", v)} /></div>
          {da
            ? <div><Label>Class column</Label>{opt("class_column", factors, "Choose…")}</div>
            : <div><Label>Responses (Y)</Label><Chips options={numeric.filter((c) => !arr(s, "predictors").includes(c))} value={arr(s, "responses")} onChange={(v) => setParam(i, "responses", v)} /></div>}
        </>);
      }
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard assessment" /></div>
          <div>
            <Label>Take column names from</Label>
            <Select value={refId} onChange={(e) => setRefId(e.target.value)} className="w-full">
              {datasets.length === 0 && <option value="">No ready datasets</option>}
              {datasets.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <p className="mt-1 text-xs text-slate-400">Pipelines refer to columns by name and can run on any dataset that has them.</p>
          </div>
          <div className="md:col-span-2"><Label>Description (optional)</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </CardBody>
      </Card>

      {steps.length === 0 && (
        <Card className="border-dashed">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">Start from the standard assessment (outliers → significance → correlation → PCA), or add steps one by one.</p>
            <Button variant="secondary" onClick={template} disabled={!columns.length}><Sparkles className="h-4 w-4" /> Use template</Button>
          </CardBody>
        </Card>
      )}

      <ol className="space-y-4">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Card>
              <CardHeader className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                <Badge tone="blue">{TYPE_LABEL[s.type]}</Badge>
                <Input value={s.label ?? ""} onChange={(e) => update(i, { label: e.target.value })} placeholder="Step label (optional)" className="h-8 max-w-xs" />
                <div className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Remove step" onClick={() => setSteps((st) => st.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">{fields(s, i)}</CardBody>
            </Card>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader><CardTitle>Add a step</CardTitle></CardHeader>
        <CardBody className="flex flex-wrap gap-2">
          {(Object.keys(TYPE_LABEL) as Type[]).map((t) => (
            <Button key={t} variant="secondary" size="sm" onClick={() => addStep(t)}><Plus className="h-3.5 w-3.5" /> {TYPE_LABEL[t]}</Button>
          ))}
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={pending || !steps.length}>{pending ? "Saving…" : "Save pipeline"}</Button>
      </div>
    </div>
  );
}

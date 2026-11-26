"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createRun } from "@/app/run-actions";
import { Button, Label, Select } from "@/components/ui";
import type { ColumnProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

type Type = "OUTLIERS" | "COMPARE" | "REGRESSION" | "CORRELATION" | "PCA" | "PLS" | "CLUSTER";
type OutlierRun = { id: string; name: string; count: number };

const TABS: { key: Type; label: string; help: string }[] = [
  { key: "OUTLIERS", label: "Outliers", help: "Runs several detection methods, picks the most suitable for your data and shows how much they agree. You confirm which rows to exclude." },
  { key: "COMPARE", label: "Compare groups", help: "Checks normality, equal variances and design balance, then chooses the test (t-test, ANOVA, Welch, Kruskal-Wallis, RM-ANOVA, Friedman, 2–3-way ANOVA) and post hoc comparisons." },
  { key: "REGRESSION", label: "Regression", help: "Linear, logistic, Poisson/negative binomial or mixed model, chosen from the response type, with diagnostics." },
  { key: "CORRELATION", label: "Correlation", help: "Pearson or Spearman chosen from normality, with confidence intervals and Holm-adjusted p-values." },
  { key: "PCA", label: "PCA", help: "Principal component analysis: checks whether the variables share structure (Bartlett, KMO), picks the number of components, and flags atypical samples (Hotelling's T², Q residuals)." },
  { key: "PLS", label: "PLS / PLS-DA", help: "Predicts numeric responses (PLS) or classes (PLS-DA) from many correlated variables. Components chosen by cross-validation; a permutation test and overfitting checks give a trust verdict. VIP scores rank variable importance." },
  { key: "CLUSTER", label: "Clustering", help: "Tries k-means and Ward hierarchical clustering for 2–10 clusters and picks the best by silhouette width, telling you whether real cluster structure exists." },
];

export function Chips({ options, value, onChange, max }: { options: string[]; value: string[]; onChange: (v: string[]) => void; max?: number }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.length === 0 && <span className="text-xs text-slate-400">No suitable columns.</span>}
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o) : max && value.length >= max ? value : [...value, o])}
            className={cn("rounded-full border px-2.5 py-1 text-xs", on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function AnalysisForm({ projectId, datasetId, columns, outlierRuns }: { projectId: string; datasetId: string; columns: ColumnProfile[]; outlierRuns: OutlierRun[] }) {
  const numeric = columns.filter((c) => c.kind === "numeric").map((c) => c.name);
  const factors = columns.filter((c) => ["categorical", "binary"].includes(c.kind) || (c.kind === "numeric" && c.unique <= 10)).map((c) => c.name);
  const ids = columns.filter((c) => ["identifier", "categorical", "text"].includes(c.kind)).map((c) => c.name);
  const all = columns.filter((c) => c.kind !== "empty").map((c) => c.name);

  const [type, setType] = useState<Type>("COMPARE");
  const [cols, setCols] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState("");
  const [response, setResponse] = useState("");
  const [facs, setFacs] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [preds, setPreds] = useState<string[]>([]);
  const [randomEffect, setRandomEffect] = useState("");
  const [outlierRun, setOutlierRun] = useState("");
  const [plsMode, setPlsMode] = useState<"pls" | "plsda">("pls");
  const [responses, setResponses] = useState<string[]>([]);
  const [classCol, setClassCol] = useState("");
  const [colorBy, setColorBy] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  // In regression, non-numeric predictors are dummy-coded; numeric ones stay continuous.
  const factorSet = new Set(columns.filter((c) => c.kind !== "numeric").map((c) => c.name));

  function params() {
    switch (type) {
      case "OUTLIERS": return { columns: cols, group_by: groupBy || null, method: "auto" };
      case "COMPARE": return { response, factors: facs, subject: subject || null };
      case "REGRESSION": return { response, predictors: preds, categorical: preds.filter((p) => factorSet.has(p)), family: "auto", random_effect: randomEffect || null };
      case "CORRELATION": return { columns: cols, method: "auto" };
      case "PCA": return { columns: cols, scaling: "auto", color_by: colorBy || null };
      case "PLS": return plsMode === "plsda"
        ? { predictors: cols, responses: [], class_column: classCol || null }
        : { predictors: cols, responses, class_column: null };
      case "CLUSTER": return { columns: cols, method: "auto", compare_with: colorBy || null };
    }
  }

  function submit() {
    start(async () => {
      const r = await createRun({ projectId, datasetId, type, params: params(), outlierRunId: type !== "OUTLIERS" && outlierRun ? outlierRun : null });
      if (r.ok) {
        toast.success("Analysis started. You'll get a notification when it's ready.");
        router.push(`/projects/${projectId}/runs/${r.runId}`);
      } else toast.error(r.error);
    });
  }

  const tab = TABS.find((t) => t.key === type)!;
  return (
    <div>
      <div className="flex flex-wrap gap-x-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setType(t.key)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm", type === t.key ? "border-brand-600 font-medium text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">{tab.help}</p>

      <div className="mt-4 space-y-4">
        {type === "PLS" && (
          <div>
            <Label>Goal</Label>
            <Select value={plsMode} onChange={(e) => setPlsMode(e.target.value as "pls" | "plsda")}>
              <option value="pls">Predict numeric response(s) — PLS regression</option>
              <option value="plsda">Discriminate classes — PLS-DA</option>
            </Select>
          </div>
        )}
        {["OUTLIERS", "CORRELATION", "PCA", "PLS", "CLUSTER"].includes(type) && (
          <div>
            <div className="flex items-center justify-between">
              <Label>{type === "PLS" ? "Predictors (X)" : "Numeric columns"}</Label>
              {type !== "OUTLIERS" && (
                <button type="button" className="mb-1 text-xs text-brand-600 hover:underline"
                  onClick={() => setCols(numeric.filter((c) => !(type === "PLS" && responses.includes(c))))}>Select all</button>
              )}
            </div>
            <Chips options={numeric.filter((c) => !(type === "PLS" && responses.includes(c)))} value={cols} onChange={setCols} />
          </div>
        )}
        {type === "PLS" && plsMode === "pls" && (
          <div>
            <Label>Response(s) (Y)</Label>
            <Chips options={numeric.filter((c) => !cols.includes(c))} value={responses} onChange={setResponses} />
          </div>
        )}
        {type === "PLS" && plsMode === "plsda" && (
          <div>
            <Label>Class column</Label>
            <Select value={classCol} onChange={(e) => setClassCol(e.target.value)}>
              <option value="">Choose…</option>
              {factors.map((f) => <option key={f}>{f}</option>)}
            </Select>
          </div>
        )}
        {(type === "PCA" || type === "CLUSTER") && (
          <div>
            <Label>{type === "PCA" ? "Colour scores by (optional)" : "Compare clusters with known groups (optional)"}</Label>
            <Select value={colorBy} onChange={(e) => setColorBy(e.target.value)}>
              <option value="">None</option>
              {factors.filter((f) => !cols.includes(f)).map((f) => <option key={f}>{f}</option>)}
            </Select>
          </div>
        )}
        {type === "OUTLIERS" && (
          <div>
            <Label>Judge within groups of (optional)</Label>
            <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              <option value="">No grouping</option>
              {factors.map((f) => <option key={f}>{f}</option>)}
            </Select>
            <p className="mt-1 text-xs text-slate-400">Recommended when groups differ (e.g. treatments), so real effects aren't flagged as outliers.</p>
          </div>
        )}
        {(type === "COMPARE" || type === "REGRESSION") && (
          <div>
            <Label>Response (dependent variable)</Label>
            <Select value={response} onChange={(e) => setResponse(e.target.value)}>
              <option value="">Choose…</option>
              {(type === "REGRESSION" ? all : numeric).map((c) => <option key={c}>{c}</option>)}
            </Select>
          </div>
        )}
        {type === "COMPARE" && (
          <>
            <div>
              <Label>Factors (1–3)</Label>
              <Chips options={factors.filter((f) => f !== response)} value={facs} onChange={setFacs} max={3} />
            </div>
            <div>
              <Label>Subject / block ID for repeated measures (optional, one factor only)</Label>
              <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Independent groups</option>
                {ids.filter((c) => !facs.includes(c)).map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
          </>
        )}
        {type === "REGRESSION" && (
          <>
            <div>
              <Label>Predictors</Label>
              <Chips options={all.filter((c) => c !== response && c !== randomEffect)} value={preds} onChange={setPreds} />
              <p className="mt-1 text-xs text-slate-400">Categorical columns are dummy-coded automatically.</p>
            </div>
            <div>
              <Label>Random intercept for (optional → mixed model)</Label>
              <Select value={randomEffect} onChange={(e) => setRandomEffect(e.target.value)}>
                <option value="">None</option>
                {ids.concat(factors).filter((c, i, a) => a.indexOf(c) === i && c !== response && !preds.includes(c)).map((c) => <option key={c}>{c}</option>)}
              </Select>
            </div>
          </>
        )}
        {type !== "OUTLIERS" && (
          <div>
            <Label>Exclude outliers</Label>
            <Select value={outlierRun} onChange={(e) => setOutlierRun(e.target.value)}>
              <option value="">Use all rows</option>
              {outlierRuns.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.count} rows)</option>)}
            </Select>
            {outlierRuns.length === 0 && <p className="mt-1 text-xs text-slate-400">Run outlier detection and confirm exclusions to use them here.</p>}
          </div>
        )}
        <Button onClick={submit} disabled={pending}>{pending ? "Starting…" : "Run analysis"}</Button>
      </div>
    </div>
  );
}

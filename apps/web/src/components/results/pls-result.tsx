"use client";

import { Plot } from "@/components/plot";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { DataInfoLine, DecisionTrail, Summary, Table, Warnings, fmt, type DataInfo, type TrailStep } from "./common";
import { groupTraces } from "./pca-result";
import { TrustVerdict, type Verdict } from "./verdict";

export type PlsResults = {
  mode: "pls" | "pls-da"; predictors: string[]; responses: string[]; class_column: string | null; data_info: DataInfo; trail: TrailStep[]; warnings: string[]; summary: string;
  n_components: number; r2x: number; r2y: number; q2: number; q2_by_component: number[]; permutation: { n: number; p: number; q2_values: number[] };
  vip: { variable: string; vip: number }[]; scores: { rows: number[]; t1: number[]; t2: number[] | null; color: (string | number)[] };
  verdict: Verdict;
  classes?: string[]; cv_accuracy?: number; balanced_accuracy?: number; chance_accuracy?: number; confusion_matrix?: number[][]; per_class_recall?: number[];
  rmsecv?: number[]; observed?: number[][]; cv_predicted?: number[][]; coefficients?: Record<string, number | string>[];
};

export function PlsResult({ r }: { r: PlsResults }) {
  const da = r.mode === "pls-da";
  const text = r.scores.rows.map((x) => `row ${x + 1}`);
  const vip = [...r.vip].reverse();
  return (
    <div className="space-y-6">
      <Summary text={r.summary} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{da ? "PLS-DA" : "PLS regression"}</Badge>
        <Badge>{r.n_components} component(s)</Badge>
        <Badge>R²X {fmt(r.r2x, 3)}</Badge><Badge>R²Y {fmt(r.r2y, 3)}</Badge><Badge tone={r.q2 >= 0.5 ? "green" : r.q2 >= 0.3 ? "amber" : "red"}>Q² {fmt(r.q2, 3)}</Badge>
        <DataInfoLine info={r.data_info} />
      </div>
      <TrustVerdict v={r.verdict} />
      <Warnings items={r.warnings} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Variable importance (VIP)</CardTitle></CardHeader>
          <CardBody>
            <Plot data={[{ type: "bar", orientation: "h", x: vip.map((v) => v.vip), y: vip.map((v) => v.variable), marker: { color: vip.map((v) => (v.vip >= 1 ? "#2f6fed" : "#cbd5e1")) } },
                         { type: "scatter", mode: "lines", x: [1, 1], y: [vip[0]?.variable, vip[vip.length - 1]?.variable], line: { dash: "dash", color: "#e8590c" } }]}
              layout={{ xaxis: { title: { text: "VIP" } }, margin: { l: 120 } }} height={Math.max(260, 22 * vip.length + 80)} />
            <p className="mt-1 text-xs text-slate-400">VIP &gt; 1 (blue): variable is important for the model.</p>
          </CardBody>
        </Card>
        {da ? (
          <Card>
            <CardHeader><CardTitle>Scores (coloured by {r.class_column})</CardTitle></CardHeader>
            <CardBody>
              <Plot data={groupTraces(r.scores.t1, r.scores.t2 ?? r.scores.t1.map(() => 0), r.scores.color, text)}
                layout={{ showlegend: true, legend: { orientation: "h", y: -0.2 }, xaxis: { title: { text: "t1" } }, yaxis: { title: { text: r.scores.t2 ? "t2" : "" } } }} />
            </CardBody>
          </Card>
        ) : (
          <Card>
            <CardHeader><CardTitle>Observed vs cross-validated prediction: {r.responses[0]}</CardTitle></CardHeader>
            <CardBody>
              {(() => {
                const o = r.observed!.map((v) => v[0]), p = r.cv_predicted!.map((v) => v[0]);
                const lo = Math.min(...o, ...p), hi = Math.max(...o, ...p);
                return <Plot data={[{ type: "scatter", mode: "markers", x: o, y: p, text, marker: { size: 7, opacity: 0.8 } },
                                    { type: "scatter", mode: "lines", x: [lo, hi], y: [lo, hi], line: { dash: "dash", color: "#94a3b8" } }]}
                  layout={{ xaxis: { title: { text: "observed" } }, yaxis: { title: { text: "predicted (CV)" } } }} />;
              })()}
              <p className="mt-1 text-xs text-slate-400">Each point was predicted by a model that did not see it. RMSECV = {r.rmsecv!.map((v) => fmt(v)).join(", ")}.</p>
            </CardBody>
          </Card>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Permutation test ({r.permutation.n} permutations)</CardTitle></CardHeader>
          <CardBody>
            <Plot data={[{ type: "histogram", x: r.permutation.q2_values, marker: { color: "#cbd5e1" }, name: "shuffled Y" },
                         { type: "scatter", mode: "lines", x: [r.q2, r.q2], y: [0, r.permutation.n / 4], line: { color: "#2f6fed", width: 3 }, name: "real model" }]}
              layout={{ xaxis: { title: { text: "Q²" } }, yaxis: { title: { text: "count" } } }} height={260} />
            <p className="mt-1 text-xs text-slate-400">The blue line (real Q²) should lie well to the right of the grey distribution. p = {fmt(r.permutation.p, 3)}.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Q² by number of components</CardTitle></CardHeader>
          <CardBody>
            <Plot data={[{ type: "scatter", mode: "lines+markers", x: r.q2_by_component.map((_, i) => i + 1), y: r.q2_by_component, marker: { color: r.q2_by_component.map((_, i) => (i + 1 === r.n_components ? "#e8590c" : "#2f6fed")), size: 9 } }]}
              layout={{ xaxis: { title: { text: "components" }, dtick: 1 }, yaxis: { title: { text: "cumulative Q²" } } }} height={260} />
          </CardBody>
        </Card>
      </div>

      {da && r.confusion_matrix && (
        <Card>
          <CardHeader><CardTitle>Cross-validated confusion matrix (accuracy {fmt(100 * r.cv_accuracy!, 1)}%, balanced {fmt(100 * r.balanced_accuracy!, 1)}%, chance {fmt(100 * r.chance_accuracy!, 0)}%)</CardTitle></CardHeader>
          <Table head={["true \\ predicted", ...r.classes!, "recall"]} rows={r.classes!.map((c, i) => [<b key="c">{c}</b>, ...r.confusion_matrix![i].map((v, j) => <span key={j} className={i === j ? "font-semibold text-emerald-700" : v ? "text-red-600" : "text-slate-300"}>{v}</span>), fmt(r.per_class_recall![i], 2)])} />
        </Card>
      )}
      {!da && r.coefficients && (
        <Card>
          <CardHeader><CardTitle>Regression coefficients (original units)</CardTitle></CardHeader>
          <Table head={["Variable", ...r.responses]} rows={r.coefficients.map((c) => [String(c.variable), ...r.responses.map((y) => fmt(c[y] as number))])} />
        </Card>
      )}
      <DecisionTrail steps={r.trail} title="Model building" />
    </div>
  );
}

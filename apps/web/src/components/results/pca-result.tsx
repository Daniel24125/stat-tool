"use client";

import { useState } from "react";
import { Plot, PALETTE } from "@/components/plot";
import { Badge, Card, CardBody, CardHeader, CardTitle, Select } from "@/components/ui";
import { DataInfoLine, DecisionTrail, Summary, Table, Warnings, fmt, type DataInfo, type TrailStep } from "./common";

export type PcaResults = {
  columns: string[]; scaling: string; data_info: DataInfo; trail: TrailStep[]; warnings: string[]; summary: string; n_components: number;
  suitability: { bartlett?: { chi2: number; df: number; p: number }; kmo?: number };
  eigenvalues: number[]; explained: number[]; cumulative: number[];
  loadings: { columns: string[]; values: number[][]; correlation: number[][]; contribution_pct: number[][] };
  scores: { rows: number[]; values: number[][]; color: string[] | null; color_by: string | null };
  diagnostics: { t2: number[]; t2_limit: number | null; q: number[]; q_limit: number | null; atypical: number[] };
};

export function groupTraces(x: number[], y: number[], color: (string | number)[] | null, text: string[]) {
  if (!color) return [{ type: "scatter" as const, mode: "markers" as const, x, y, text, marker: { size: 8, opacity: 0.8 } }];
  const groups = [...new Set(color.map(String))];
  return groups.map((g, i) => {
    const idx = color.map((c, j) => (String(c) === g ? j : -1)).filter((j) => j >= 0);
    return { type: "scatter" as const, mode: "markers" as const, name: g, x: idx.map((j) => x[j]), y: idx.map((j) => y[j]), text: idx.map((j) => text[j]), marker: { size: 8, opacity: 0.8, color: PALETTE[i % PALETTE.length] } };
  });
}

export function PcaResult({ r }: { r: PcaResults }) {
  const k = r.n_components;
  const pcs = Array.from({ length: k }, (_, i) => `PC${i + 1}`);
  const [ax, setAx] = useState([0, 1]);
  const lab = (i: number) => `PC${i + 1} (${(100 * r.explained[i]).toFixed(1)}%)`;
  const sx = r.scores.values.map((v) => v[ax[0]]), sy = r.scores.values.map((v) => v[ax[1]]);
  const text = r.scores.rows.map((x) => `row ${x + 1}`);
  // scale loadings onto the score axes for the biplot arrows
  const f = Math.max(...sx.map(Math.abs), ...sy.map(Math.abs)) / Math.max(...r.loadings.values.flatMap((l) => [Math.abs(l[ax[0]]), Math.abs(l[ax[1]])]), 1e-9) * 0.8;
  const arrows = r.loadings.columns.map((c, i) => ({
    type: "scatter" as const, mode: "text+lines" as const, x: [0, r.loadings.values[i][ax[0]] * f], y: [0, r.loadings.values[i][ax[1]] * f],
    text: ["", c], textposition: "top center" as const, line: { color: "#64748b", width: 1.5 }, hoverinfo: "skip" as const, showlegend: false,
  }));

  return (
    <div className="space-y-6">
      <Summary text={r.summary} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{r.scaling}</Badge>
        <Badge>{k} components</Badge>
        {r.suitability.kmo !== undefined && <Badge tone={r.suitability.kmo >= 0.6 ? "green" : "amber"}>KMO {fmt(r.suitability.kmo, 2)}</Badge>}
        <DataInfoLine info={r.data_info} />
      </div>
      <Warnings items={r.warnings} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Biplot</CardTitle>
            {k > 2 && (
              <div className="flex gap-1 text-xs">
                {[0, 1].map((slot) => (
                  <Select key={slot} value={ax[slot]} onChange={(e) => setAx((a) => (slot === 0 ? [+e.target.value, a[1]] : [a[0], +e.target.value]))} className="h-7 text-xs">
                    {pcs.map((p, i) => <option key={p} value={i}>{p}</option>)}
                  </Select>
                ))}
              </div>
            )}
          </CardHeader>
          <CardBody>
            <Plot name={`pca-biplot-pc${ax[0] + 1}-pc${ax[1] + 1}`} data={[...groupTraces(sx, sy, r.scores.color, text), ...arrows]}
              layout={{ showlegend: !!r.scores.color, legend: { orientation: "h", y: -0.2 }, xaxis: { title: { text: lab(ax[0]) }, zeroline: true }, yaxis: { title: { text: lab(ax[1]) }, zeroline: true } }} height={400} />
            <p className="mt-1 text-xs text-slate-400">Points are samples (scores); arrows are variables (loadings). Variables pointing the same way are positively correlated.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Scree plot</CardTitle></CardHeader>
          <CardBody>
            <Plot name={"pca-scree"} data={[{ type: "bar", x: r.explained.map((_, i) => `PC${i + 1}`), y: r.explained.map((e) => 100 * e), marker: { color: r.explained.map((_, i) => (i < k ? "#0f6b68" : "#cbd5e1")) }, name: "% variance" },
                         { type: "scatter", mode: "lines+markers", x: r.cumulative.map((_, i) => `PC${i + 1}`), y: r.cumulative.map((c) => 100 * c), line: { color: "#c2571a" }, name: "cumulative %" }]}
              layout={{ yaxis: { title: { text: "% of variance" }, range: [0, 105] }, showlegend: true, legend: { orientation: "h", y: -0.2 } }} height={400} />
          </CardBody>
        </Card>
      </div>

      <DecisionTrail steps={r.trail} />

      <Card>
        <CardHeader><CardTitle>Loadings (correlation of each variable with each component)</CardTitle></CardHeader>
        <Table head={["Variable", ...pcs]} rows={r.loadings.columns.map((c, i) => [c, ...pcs.map((_, j) => {
          const v = r.loadings.correlation[i][j];
          return <span key={j} className={Math.abs(v) >= 0.7 ? "font-semibold text-brand-700" : Math.abs(v) >= 0.4 ? "text-slate-800" : "text-slate-400"}>{fmt(v, 2)}</span>;
        })])} />
        <p className="px-5 pb-3 text-xs text-slate-400">|r| ≥ 0.7 bold: the variable is strongly represented by that component.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Influence plot: Hotelling&apos;s T² vs Q residuals</CardTitle></CardHeader>
          <CardBody>
            <Plot name={"pca-t2-q-influence"} data={[
              { type: "scatter", mode: "markers", x: r.diagnostics.t2, y: r.diagnostics.q, text, marker: { size: 7, color: r.scores.rows.map((row) => (r.diagnostics.atypical.includes(row) ? "#c92a2a" : "#0f6b68")) } },
              ...(r.diagnostics.t2_limit ? [{ type: "scatter" as const, mode: "lines" as const, x: [r.diagnostics.t2_limit, r.diagnostics.t2_limit], y: [0, Math.max(...r.diagnostics.q, r.diagnostics.q_limit ?? 0) * 1.05], line: { dash: "dash" as const, color: "#94a3b8" } }] : []),
              ...(r.diagnostics.q_limit ? [{ type: "scatter" as const, mode: "lines" as const, x: [0, Math.max(...r.diagnostics.t2, r.diagnostics.t2_limit ?? 0) * 1.05], y: [r.diagnostics.q_limit, r.diagnostics.q_limit], line: { dash: "dash" as const, color: "#94a3b8" } }] : []),
            ]} layout={{ xaxis: { title: { text: "Hotelling's T² (distance within the model)" } }, yaxis: { title: { text: "Q residual (distance to the model)" } } }} height={320} />
            <p className="mt-1 text-xs text-slate-400">Dashed lines are 95% limits. Red samples are atypical: extreme within the model (right) or poorly described by it (top).</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Atypical samples</CardTitle></CardHeader>
          {r.diagnostics.atypical.length === 0 ? <CardBody className="text-sm text-slate-500">None outside the 95% limits.</CardBody> : (
            <Table head={["Data row", "T²", "Q"]} rows={r.diagnostics.atypical.map((row) => {
              const i = r.scores.rows.indexOf(row);
              return [row + 1, fmt(r.diagnostics.t2[i], 2), fmt(r.diagnostics.q[i], 2)];
            })} />
          )}
          {r.suitability.bartlett && (
            <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              Bartlett&apos;s sphericity: χ²({fmt(r.suitability.bartlett.df, 0)}) = {fmt(r.suitability.bartlett.chi2, 1)}, p = {fmt(r.suitability.bartlett.p, 3)}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

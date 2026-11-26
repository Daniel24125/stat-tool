"use client";

import { Plot } from "@/components/plot";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui";
import { DataInfoLine, DecisionTrail, P, Summary, Table, Warnings, fmt, type DataInfo, type TrailStep } from "./common";
import { ResidualPlots } from "./residual-plots";

type Row = { term: string; stat_name: string; statistic: number; df1: number | null; df2: number | null; p: number; effect_name: string | null; effect_size: number | null; effect_size_2?: number };
type Comp = { a: string; b: string; diff: number | null; diff_label?: string; p_adj: number; ci_low: number | null; ci_high: number | null; significant: boolean };
type Group = { label: string; n: number; mean: number; sd: number; se: number; ci95: [number, number]; median: number };

export type CompareResults = {
  response: string; factors: string[]; subject: string | null; data_info: DataInfo; trail: TrailStep[]; warnings: string[]; summary: string;
  test: { name: string; family: string; transform?: { name: string; lambda: number } | null };
  table: Row[]; posthoc: { term: string; method: string; note?: string | null; comparisons: Comp[] }[];
  groups: Group[]; plot: { label: string[]; y: number[] };
  design?: { balanced: boolean; cells: number; empty_cells: number; min_cell_n: number; max_cell_n: number };
  interaction_plot?: { x: string; trace: string; points: { x: string; trace: string; mean: number; se: number }[] };
  residuals?: { fitted: number[]; resid: number[]; qq_theoretical: number[]; qq_sample: number[] };
};

export function CompareResult({ r }: { r: CompareResults }) {
  const labels = r.groups.map((g) => g.label);
  const traces = r.interaction_plot
    ? [...new Set(r.interaction_plot.points.map((p) => p.trace))].map((t) => {
        const pts = r.interaction_plot!.points.filter((p) => p.trace === t);
        return { type: "scatter" as const, mode: "lines+markers" as const, name: `${r.interaction_plot!.trace} = ${t}`, x: pts.map((p) => p.x), y: pts.map((p) => p.mean),
                 error_y: { type: "data" as const, array: pts.map((p) => p.se), visible: true } };
      })
    : [];

  return (
    <div className="space-y-6">
      <Summary text={r.summary} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{r.test.name}</Badge>
        <Badge tone={r.test.family === "parametric" ? "violet" : "amber"}>{r.test.family}</Badge>
        {r.test.transform && <Badge tone="amber">{r.test.transform.name} λ = {fmt(r.test.transform.lambda, 2)}</Badge>}
        {r.design && <Badge>{r.design.balanced ? "balanced design" : "unbalanced design"}</Badge>}
        <DataInfoLine info={r.data_info} />
      </div>
      <Warnings items={r.warnings} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{r.response} by {r.factors.join(" × ")}</CardTitle></CardHeader>
          <CardBody>
            <Plot name={`${r.response}-by-${r.factors.join("-")}-boxplot`}
              data={[{ type: "box", x: r.plot.label, y: r.plot.y, boxpoints: "all", jitter: 0.4, pointpos: 0, marker: { size: 5, opacity: 0.6 }, line: { width: 1.5 } },
                     { type: "scatter", mode: "markers", x: labels, y: r.groups.map((g) => g.mean), marker: { symbol: "diamond", size: 10, color: "#c2571a" }, name: "mean",
                       error_y: { type: "data", symmetric: false, array: r.groups.map((g) => g.ci95[1] - g.mean), arrayminus: r.groups.map((g) => g.mean - g.ci95[0]), color: "#c2571a" } }]}
              layout={{ yaxis: { title: { text: r.response } }, xaxis: { categoryorder: "array", categoryarray: labels } }}
            />
            <p className="mt-1 text-xs text-slate-400">Box plots with individual points; orange diamonds are means with 95% CIs.</p>
          </CardBody>
        </Card>
        {r.interaction_plot ? (
          <Card>
            <CardHeader><CardTitle>Interaction plot</CardTitle></CardHeader>
            <CardBody>
              <Plot name={`${r.response}-interaction`} data={traces} layout={{ showlegend: true, legend: { orientation: "h", y: -0.2 }, xaxis: { title: { text: r.interaction_plot.x } }, yaxis: { title: { text: `mean ${r.response} ± SE` } } }} />
              <p className="mt-1 text-xs text-slate-400">Non-parallel lines suggest an interaction.</p>
            </CardBody>
          </Card>
        ) : (
          <DecisionTrail steps={r.trail} />
        )}
      </div>
      {r.interaction_plot && <DecisionTrail steps={r.trail} />}

      <Card>
        <CardHeader><CardTitle>Test results</CardTitle></CardHeader>
        <Table
          head={["Term", "Statistic", "df", "p", "Effect size"]}
          rows={r.table.map((t) => [
            <span key="t" className="font-medium">{t.term}</span>,
            `${t.stat_name} = ${fmt(t.statistic, 3)}`,
            [t.df1, t.df2].filter((x) => x !== null && x !== undefined).map((x) => fmt(x as number, 2)).join(", ") || "—",
            <P key="p" p={t.p} />,
            t.effect_name ? `${t.effect_name} = ${fmt(t.effect_size, 3)}${t.effect_size_2 !== undefined ? ` (${fmt(t.effect_size_2, 3)})` : ""}` : "—",
          ])}
        />
      </Card>

      {r.posthoc.map((ph) => (
        <Card key={ph.term + ph.method}>
          <CardHeader>
            <CardTitle>Pairwise comparisons: {ph.term} <span className="font-normal text-slate-500">({ph.method})</span></CardTitle>
            {ph.note && <p className="mt-0.5 text-xs text-slate-500">{ph.note}</p>}
          </CardHeader>
          <Table
            head={["Comparison", "Difference", "95% CI", "adjusted p"]}
            rows={ph.comparisons.map((c) => [
              c.diff_label ?? `${c.a} vs ${c.b}`,
              fmt(c.diff, 3),
              c.ci_low !== null && c.ci_high !== null ? `[${fmt(c.ci_low, 3)}, ${fmt(c.ci_high, 3)}]` : "—",
              <P key="p" p={c.p_adj} sig={c.significant} />,
            ])}
          />
        </Card>
      ))}

      <Card>
        <CardHeader><CardTitle>Group descriptives</CardTitle></CardHeader>
        <Table
          head={["Group", "n", "Mean", "SD", "SE", "95% CI", "Median"]}
          rows={r.groups.map((g) => [g.label, g.n, fmt(g.mean), fmt(g.sd), fmt(g.se), `[${fmt(g.ci95[0])}, ${fmt(g.ci95[1])}]`, fmt(g.median)])}
        />
      </Card>

      {r.residuals && <ResidualPlots res={r.residuals} />}
    </div>
  );
}

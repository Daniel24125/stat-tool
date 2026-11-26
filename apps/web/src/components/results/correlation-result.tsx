"use client";

import { Plot } from "@/components/plot";
import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui";
import { DataInfoLine, DecisionTrail, P, Table, fmt, type DataInfo, type TrailStep } from "./common";

export type CorrelationResults = {
  method: string; columns: string[]; data_info: DataInfo; trail: TrailStep[]; matrix: (number | null)[][];
  pairs: { a: string; b: string; r: number; p: number; p_adj: number; ci_low: number; ci_high: number; significant: boolean }[];
};

export function CorrelationResult({ r }: { r: CorrelationResults }) {
  const sym = r.method === "pearson" ? "r" : "ρ";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{r.method === "pearson" ? "Pearson" : "Spearman"} correlation</Badge>
        <DataInfoLine info={r.data_info} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Correlation matrix</CardTitle></CardHeader>
          <CardBody>
            <Plot
              data={[{ type: "heatmap", z: r.matrix, x: r.columns, y: r.columns, zmin: -1, zmax: 1, colorscale: "RdBu", reversescale: true,
                       text: r.matrix.map((row) => row.map((v) => fmt(v, 2))) as unknown as string[], texttemplate: "%{text}", hoverongaps: false }]}
              layout={{ yaxis: { autorange: "reversed" }, margin: { l: 100, b: 90, t: 16, r: 16 } }}
              height={Math.max(320, 60 * r.columns.length)}
            />
          </CardBody>
        </Card>
        <DecisionTrail steps={r.trail} />
      </div>
      <Card>
        <CardHeader><CardTitle>Pairwise correlations</CardTitle></CardHeader>
        <Table
          head={["Pair", sym, "95% CI", "p", "Holm-adjusted p"]}
          rows={[...r.pairs].sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).map((p) => [
            `${p.a} – ${p.b}`, fmt(p.r, 3), `[${fmt(p.ci_low, 2)}, ${fmt(p.ci_high, 2)}]`, <P key="p" p={p.p} sig={false} />, <P key="pa" p={p.p_adj} sig={p.significant} />,
          ])}
        />
      </Card>
    </div>
  );
}

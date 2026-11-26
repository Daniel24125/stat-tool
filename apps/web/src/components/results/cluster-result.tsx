"use client";

import { Plot, PALETTE } from "@/components/plot";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { DataInfoLine, DecisionTrail, Summary, Table, Warnings, fmt, type DataInfo, type TrailStep } from "./common";
import { groupTraces } from "./pca-result";

export type ClusterResults = {
  columns: string[]; data_info: DataInfo; method: string; k: number; silhouette: number; structure: string; trail: TrailStep[]; warnings: string[]; summary: string;
  silhouette_by_k: { k: number[]; kmeans?: (number | null)[]; ward?: (number | null)[] };
  sizes: number[]; centroids: Record<string, number>[]; assignments: { rows: number[]; cluster: number[] };
  projection: { x: number[]; y: number[] };
  dendrogram: { icoord: number[][]; dcoord: number[][]; labels: string[]; colors: string[] };
  agreement?: { column: string; adjusted_rand: number; crosstab: Record<string, string | number>[] };
};

export function ClusterResult({ r }: { r: ClusterResults }) {
  const text = r.assignments.rows.map((x) => `row ${x + 1}`);
  const sk = r.silhouette_by_k;
  const colorMap: Record<string, string> = {};
  const dendro = r.dendrogram.icoord.map((xs, i) => {
    const c = r.dendrogram.colors[i];
    colorMap[c] ??= c === "C0" ? "#94a3b8" : PALETTE[Object.keys(colorMap).length % PALETTE.length];
    return { type: "scatter" as const, mode: "lines" as const, x: xs, y: r.dendrogram.dcoord[i], line: { color: colorMap[c], width: 1.5 }, hoverinfo: "skip" as const };
  });
  const showLabels = r.dendrogram.labels.length <= 60;

  return (
    <div className="space-y-6">
      <Summary text={r.summary} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{r.method === "kmeans" ? "k-means" : "Ward hierarchical"}</Badge>
        <Badge>k = {r.k}</Badge>
        <Badge tone={r.silhouette > 0.5 ? "green" : r.silhouette > 0.25 ? "amber" : "red"}>silhouette {fmt(r.silhouette, 2)}: {r.structure} structure</Badge>
        <DataInfoLine info={r.data_info} />
      </div>
      <Warnings items={r.warnings} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Clusters on the first two principal components</CardTitle></CardHeader>
          <CardBody>
            <Plot name={"clusters-pc-projection"} data={groupTraces(r.projection.x, r.projection.y, r.assignments.cluster.map((c) => `cluster ${c}`), text)}
              layout={{ showlegend: true, legend: { orientation: "h", y: -0.2 }, xaxis: { title: { text: "PC1" } }, yaxis: { title: { text: "PC2" } } }} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>Silhouette width by number of clusters</CardTitle></CardHeader>
          <CardBody>
            <Plot name={"clusters-silhouette"} data={[
              ...(sk.kmeans ? [{ type: "scatter" as const, mode: "lines+markers" as const, name: "k-means", x: sk.k, y: sk.kmeans }] : []),
              ...(sk.ward ? [{ type: "scatter" as const, mode: "lines+markers" as const, name: "Ward", x: sk.k, y: sk.ward }] : []),
            ]} layout={{ showlegend: true, legend: { orientation: "h", y: -0.2 }, xaxis: { title: { text: "k" }, dtick: 1 }, yaxis: { title: { text: "average silhouette" } },
                         shapes: [{ type: "rect", xref: "paper", x0: 0, x1: 1, y0: Math.min(0, ...[...(sk.kmeans ?? []), ...(sk.ward ?? [])].map((v) => v ?? 0)), y1: 0.25, fillcolor: "#fee2e2", opacity: 0.4, line: { width: 0 }, layer: "below" }] }} />
            <p className="mt-1 text-xs text-slate-400">Higher is better. The red band (≤ 0.25) means no substantial structure.</p>
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Dendrogram (Ward linkage)</CardTitle></CardHeader>
        <CardBody>
          <Plot name={"clusters-dendrogram"} data={dendro} layout={{ xaxis: { showticklabels: showLabels, tickvals: r.dendrogram.labels.map((_, i) => 5 + 10 * i), ticktext: r.dendrogram.labels, tickangle: -90, tickfont: { size: 9 }, showgrid: false }, yaxis: { title: { text: "distance" } } }} height={340} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Cluster profiles (means in original units)</CardTitle></CardHeader>
        <Table head={["Cluster", "n", ...r.columns]} rows={r.centroids.map((c) => [c.cluster, c.n, ...r.columns.map((col) => fmt(c[col]))])} />
      </Card>
      {r.agreement && (
        <Card>
          <CardHeader><CardTitle>Agreement with {r.agreement.column} (adjusted Rand index {fmt(r.agreement.adjusted_rand, 2)})</CardTitle></CardHeader>
          <Table head={[r.agreement.column, ...Array.from({ length: r.k }, (_, i) => `cluster ${i + 1}`)]}
            rows={r.agreement.crosstab.map((row) => [String(row[r.agreement!.column]), ...Array.from({ length: r.k }, (_, i) => row[String(i + 1)] ?? 0)])} />
          <p className="px-5 pb-3 text-xs text-slate-400">ARI 1 = identical partitions, 0 = no better than random.</p>
        </Card>
      )}
      <DecisionTrail steps={r.trail} />
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmExclusions } from "@/app/run-actions";
import { Plot } from "@/components/plot";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { DataInfoLine, DecisionTrail, Table, Warnings, fmt, type DataInfo, type TrailStep } from "./common";

export type OutlierResults = {
  columns: string[]; group_by: string | null; selected_method: string; selected_method_label: string; data_info: DataInfo; trail: TrailStep[]; warnings: string[];
  methods: { key: string; label: string; n_flagged: number | null; skipped: string | null }[];
  flagged: { row: number; values: Record<string, number>; group: string | null; flagged_by_selected: boolean; methods: string[]; score: number }[];
  plot: { rows: number[]; values: Record<string, number[]>; group: string[] | null; flag: boolean[] };
};

export function OutlierResult({ r, projectId, runId, canEdit, saved, confirmed }: { r: OutlierResults; projectId: string; runId: string; canEdit: boolean; saved: number[]; confirmed: boolean }) {
  const [sel, setSel] = useState<Set<number>>(new Set(saved));
  const [pending, start] = useTransition();
  const router = useRouter();
  const nMethods = r.methods.filter((m) => !m.skipped).length;
  const excluded = r.plot.rows.map((row) => sel.has(row));

  const [cx, cy] = r.columns;
  const plotData = cy
    ? [{ type: "scatter" as const, mode: "markers" as const, x: r.plot.values[cx], y: r.plot.values[cy], text: r.plot.rows.map((x) => `row ${x + 1}`),
         marker: { size: excluded.map((e) => (e ? 11 : 7)), color: excluded.map((e) => (e ? "#c92a2a" : "#2f6fed")), opacity: 0.75 } }]
    : [{ type: "box" as const, x: r.plot.group ?? undefined, y: r.plot.values[cx], boxpoints: false as const, line: { color: "#94a3b8" } },
       { type: "scatter" as const, mode: "markers" as const, x: r.plot.group ?? r.plot.rows.map(() => cx), y: r.plot.values[cx], text: r.plot.rows.map((x) => `row ${x + 1}`),
         marker: { size: excluded.map((e) => (e ? 11 : 6)), color: excluded.map((e) => (e ? "#c92a2a" : "#2f6fed")), opacity: 0.7 } }];

  function save() {
    start(async () => {
      const res = await confirmExclusions(projectId, runId, [...sel]);
      if (res.ok) { toast.success(`${res.count} row(s) saved for exclusion. Choose this run under "Exclude outliers" in later analyses.`); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">Selected: {r.selected_method_label}</Badge>
        {r.group_by && <Badge>within {r.group_by}</Badge>}
        <DataInfoLine info={r.data_info} />
      </div>
      <Warnings items={r.warnings} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{cy ? `${cx} vs ${cy}` : cx}{r.columns.length > 2 ? " (first two variables)" : ""}</CardTitle></CardHeader>
          <CardBody>
            <Plot data={plotData} layout={{ xaxis: { title: { text: cy ? cx : r.group_by ?? "" } }, yaxis: { title: { text: cy ?? cx } } }} />
            <p className="mt-1 text-xs text-slate-400">Red points are currently selected for exclusion.</p>
          </CardBody>
        </Card>
        <DecisionTrail steps={r.trail} />
      </div>

      <Card>
        <CardHeader><CardTitle>Agreement between methods</CardTitle></CardHeader>
        <Table head={["Method", "Rows flagged"]} rows={r.methods.map((m) => [
          <span key="m" className={m.key === r.selected_method ? "font-semibold" : ""}>{m.label}{m.key === r.selected_method ? " (selected)" : ""}</span>,
          m.skipped ? <span key="s" className="text-xs text-slate-400">skipped: {m.skipped}</span> : m.n_flagged,
        ])} />
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <CardTitle>Flagged rows</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">Rows flagged by the selected method or by at least two methods. Pre-selected rows are the selected method&apos;s suggestions.</p>
          </div>
          {canEdit && <Button size="sm" onClick={save} disabled={pending}>{pending ? "Saving…" : confirmed ? "Update exclusions" : "Confirm exclusions"}</Button>}
        </CardHeader>
        {confirmed && <p className="border-b border-slate-100 bg-emerald-50 px-5 py-2 text-xs text-emerald-800">Confirmed: {saved.length} row(s) will be excluded when this run is chosen in later analyses.</p>}
        {r.flagged.length === 0 ? <CardBody className="text-sm text-slate-500">No outliers found.</CardBody> : (
          <Table
            head={["Exclude", "Data row", ...r.columns, ...(r.group_by ? [r.group_by] : []), "Methods agreeing", "Score"]}
            rows={r.flagged.map((f) => [
              <input key="c" type="checkbox" disabled={!canEdit} checked={sel.has(f.row)} className="h-4 w-4 accent-red-600"
                onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(f.row); else n.delete(f.row); return n; })} />,
              f.row + 1,
              ...r.columns.map((c) => fmt(f.values[c])),
              ...(r.group_by ? [f.group] : []),
              <span key="m" title={f.methods.join(", ")}>{f.methods.length} / {nMethods}</span>,
              fmt(f.score, 2),
            ])}
          />
        )}
      </Card>
    </div>
  );
}

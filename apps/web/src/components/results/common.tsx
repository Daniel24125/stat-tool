import { AlertTriangle, CheckCircle2, CircleDot, XCircle } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import { fmt, fmtP } from "@/lib/utils";

export type TrailStep = { check: string; result: string; consequence: string; ok: boolean | null };
export type DataInfo = { n_total: number; n_excluded_outliers: number; n_missing_dropped: number; n_used: number };

export function DecisionTrail({ steps, title = "How the method was chosen" }: { steps: TrailStep[]; title?: string }) {
  if (!steps?.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <ol className="divide-y divide-slate-100">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 px-5 py-3">
            {s.ok === true ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              : s.ok === false ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              : <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
            <div className="text-sm">
              <p><span className="font-medium">{s.check}:</span> <span className="text-slate-600">{s.result}</span></p>
              <p className="text-slate-500">→ {s.consequence}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export function Warnings({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardBody>
        <p className="flex items-center gap-2 text-sm font-medium text-amber-800"><AlertTriangle className="h-4 w-4" /> Points to consider</p>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-amber-900">{items.map((w) => <li key={w}>{w}</li>)}</ul>
      </CardBody>
    </Card>
  );
}

export function DataInfoLine({ info }: { info: DataInfo }) {
  return (
    <p className="text-xs text-slate-500">
      {info.n_used} of {info.n_total} rows used
      {info.n_excluded_outliers > 0 && ` · ${info.n_excluded_outliers} excluded as outliers`}
      {info.n_missing_dropped > 0 && ` · ${info.n_missing_dropped} dropped for missing values`}
    </p>
  );
}

export function Summary({ text }: { text: string }) {
  return <div className="rounded-xl border border-brand-100 bg-brand-50 px-5 py-4 text-sm text-slate-800">{text}</div>;
}

export function Table({ head, rows, className }: { head: React.ReactNode[]; rows: React.ReactNode[][]; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className ?? ""}`}>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-100 text-left text-xs text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className="whitespace-nowrap px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="whitespace-nowrap px-4 py-2">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function P({ p, sig }: { p: number | null; sig?: boolean }) {
  const s = sig ?? (p !== null && p < 0.05);
  return <span className={s ? "font-semibold text-emerald-700" : "text-slate-600"}>{fmtP(p)}{s ? " *" : ""}</span>;
}

export { fmt };

import { AlertTriangle } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, CardTitle } from "@/components/ui";
import type { ColumnProfile, Profile } from "@/lib/types";
import { fmt, fmtP } from "@/lib/utils";

const kindTone = {
  numeric: "blue", categorical: "violet", binary: "violet", datetime: "slate", identifier: "slate", text: "slate", empty: "red",
} as const;

function Histogram({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1);
  const w = 160, h = 40, bw = w / counts.length;
  return (
    <svg width={w} height={h} className="text-brand-500" role="img" aria-label="Distribution">
      {counts.map((c, i) => (
        <rect key={i} x={i * bw + 0.5} y={h - (c / max) * h} width={Math.max(bw - 1, 1)} height={(c / max) * h} fill="currentColor" opacity={0.75} />
      ))}
    </svg>
  );
}

function NumericCell({ col }: { col: ColumnProfile }) {
  const n = col.numeric!;
  const norm = n.normality;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Histogram counts={n.histogram.counts} />
      <dl className="grid grid-cols-4 gap-x-4 gap-y-0.5 text-xs">
        <dt className="text-slate-500">mean</dt><dd>{fmt(n.mean)}</dd>
        <dt className="text-slate-500">sd</dt><dd>{fmt(n.sd)}</dd>
        <dt className="text-slate-500">median</dt><dd>{fmt(n.median)}</dd>
        <dt className="text-slate-500">IQR</dt><dd>{fmt(n.q1)}–{fmt(n.q3)}</dd>
        <dt className="text-slate-500">min</dt><dd>{fmt(n.min)}</dd>
        <dt className="text-slate-500">max</dt><dd>{fmt(n.max)}</dd>
        <dt className="text-slate-500">skew</dt><dd>{fmt(n.skewness, 2)}</dd>
        <dt className="text-slate-500">kurt</dt><dd>{fmt(n.kurtosis, 2)}</dd>
      </dl>
      <div className="text-xs" title={norm.reason}>
        {norm.normal === null ? (
          <span className="text-slate-400">Normality not tested</span>
        ) : (
          <>
            <Badge tone={norm.normal ? "green" : "amber"}>{norm.normal ? "Looks normal" : "Non-normal"}</Badge>
            <p className="mt-1 text-slate-500">{norm.test}, p = {fmtP(norm.p)}</p>
          </>
        )}
      </div>
    </div>
  );
}

function CategoricalCell({ col }: { col: ColumnProfile }) {
  const c = col.categorical!;
  return (
    <div className="text-xs text-slate-600">
      <span className="mr-2">{c.levels} levels{c.balanced && " · balanced"}</span>
      {c.top.slice(0, 6).map((t) => (
        <span key={t.value} className="mr-1 inline-block rounded bg-slate-100 px-1.5 py-0.5">{t.value} <span className="text-slate-400">({t.count})</span></span>
      ))}
      {c.levels > 6 && <span className="text-slate-400">…</span>}
    </div>
  );
}

function corrColor(v: number | null) {
  if (v === null) return "#f1f5f9";
  const a = Math.min(Math.abs(v), 1);
  return v >= 0 ? `rgba(47,111,237,${a})` : `rgba(220,38,38,${a})`;
}

export function ProfileView({ profile }: { profile: Profile }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Rows", profile.n_rows],
          ["Columns", profile.n_cols],
          ["Complete rows", profile.complete_rows],
          ["Factors / responses", `${profile.suggested_roles.factors.length} / ${profile.suggested_roles.responses.length}`],
        ].map(([k, v]) => (
          <Card key={k as string}><CardBody><p className="text-xs text-slate-500">{k}</p><p className="mt-1 text-xl font-semibold">{v}</p></CardBody></Card>
        ))}
      </div>

      {profile.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardBody>
            <p className="flex items-center gap-2 text-sm font-medium text-amber-800"><AlertTriangle className="h-4 w-4" /> Data quality notes</p>
            <ul className="mt-2 list-disc pl-6 text-sm text-amber-900">{profile.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Columns</CardTitle></CardHeader>
        <ul className="divide-y divide-slate-100">
          {profile.columns.map((col) => (
            <li key={col.name} className="grid gap-3 px-5 py-4 md:grid-cols-[220px_1fr]">
              <div>
                <p className="font-medium">{col.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Badge tone={kindTone[col.kind]} title={col.kind_reason}>{col.kind}</Badge>
                  {col.missing > 0 && <span className="text-xs text-amber-700">{col.missing} missing ({fmt(col.missing_pct, 1)}%)</span>}
                </div>
                <p className="mt-1 text-xs text-slate-400">{col.kind_reason}</p>
              </div>
              <div>
                {col.numeric && <NumericCell col={col} />}
                {col.categorical && <CategoricalCell col={col} />}
                {!col.numeric && !col.categorical && <span className="text-xs text-slate-400">{col.unique} unique values</span>}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {profile.correlation && (
        <Card>
          <CardHeader>
            <CardTitle>Correlation ({profile.correlation.method})</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">{profile.correlation.reason}</p>
          </CardHeader>
          <CardBody className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr><th />{profile.correlation.columns.map((c) => <th key={c} className="max-w-20 truncate px-1 font-normal text-slate-500">{c}</th>)}</tr>
              </thead>
              <tbody>
                {profile.correlation.matrix.map((row, i) => (
                  <tr key={i}>
                    <th className="pr-2 text-right font-normal text-slate-500">{profile.correlation!.columns[i]}</th>
                    {row.map((v, j) => (
                      <td key={j} className="h-9 w-14 text-center" style={{ background: corrColor(v), color: v !== null && Math.abs(v) > 0.5 ? "white" : undefined }}>
                        {fmt(v, 2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Preview (first {profile.preview.rows.length} rows)</CardTitle></CardHeader>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left">
              <tr>{profile.preview.columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profile.preview.rows.map((r, i) => (
                <tr key={i}>{r.map((v, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5 text-slate-700">{v === null ? <span className="text-slate-300">NA</span> : String(v)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

"use client";

import { Card, CardBody, CardHeader, CardTitle, Badge } from "@/components/ui";
import { DataInfoLine, DecisionTrail, P, Summary, Table, Warnings, fmt, type DataInfo, type TrailStep } from "./common";
import { ResidualPlots } from "./residual-plots";

type Coef = { term: string; estimate: number; se: number; stat_name: string; statistic: number; p: number; ci_low: number; ci_high: number; significant: boolean; exp_estimate?: number; exp_ci_low?: number; exp_ci_high?: number };

export type RegressionResults = {
  response: string; family: string; formula: string; summary: string; data_info: DataInfo; trail: TrailStep[]; warnings: string[];
  coefficients: Coef[]; fit: Record<string, number | string | boolean | null>;
  diagnostics?: { vif: { term: string; vif: number | null }[]; influential: { row: number; cooks_d: number }[]; breusch_pagan_p: number; cooks_cutoff: number };
  residuals: { fitted: number[]; resid: number[]; qq_theoretical: number[]; qq_sample: number[] };
};

const FIT_LABELS: Record<string, string> = {
  n: "n", r2: "R²", adj_r2: "Adjusted R²", rmse: "RMSE", f: "F", f_p: "F-test p", aic: "AIC", bic: "BIC", durbin_watson: "Durbin-Watson",
  deviance: "Deviance", null_deviance: "Null deviance", pseudo_r2_mcfadden: "McFadden pseudo-R²", lr_test_p: "Likelihood-ratio p",
  groups: "Groups", icc: "ICC", random_intercept_var: "Random-intercept variance", residual_var: "Residual variance", log_likelihood: "Log-likelihood",
  events_per_variable: "Events per variable",
};

export function RegressionResult({ r }: { r: RegressionResults }) {
  const expLabel = r.fit.exp_label as string | undefined;
  return (
    <div className="space-y-6">
      <Summary text={r.summary} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="blue">{String(r.fit.model)}</Badge>
        <code className="rounded bg-slate-100 px-2 py-0.5 text-xs">{r.formula}</code>
        <DataInfoLine info={r.data_info} />
      </div>
      <Warnings items={r.warnings} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>Coefficients</CardTitle></CardHeader>
          <Table
            head={["Term", "Estimate", "SE", "Statistic", "p", "95% CI", ...(expLabel ? [expLabel] : [])]}
            rows={r.coefficients.map((c) => [
              <span key="t" className="font-medium">{c.term}</span>, fmt(c.estimate), fmt(c.se), `${c.stat_name} = ${fmt(c.statistic, 2)}`,
              <P key="p" p={c.p} sig={c.significant} />, `[${fmt(c.ci_low)}, ${fmt(c.ci_high)}]`,
              ...(expLabel ? [`${fmt(c.exp_estimate)} [${fmt(c.exp_ci_low)}, ${fmt(c.exp_ci_high)}]`] : []),
            ])}
          />
        </Card>
        <Card>
          <CardHeader><CardTitle>Model fit</CardTitle></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              {Object.entries(r.fit).filter(([k, v]) => FIT_LABELS[k] && v !== null).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-500">{FIT_LABELS[k]}</dt>
                  <dd className="text-right">{typeof v === "number" ? (k.endsWith("_p") ? <P p={v} /> : fmt(v)) : String(v)}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      </div>

      <DecisionTrail steps={r.trail} title="Model choice and checks" />
      <ResidualPlots res={r.residuals} />

      {r.diagnostics && (
        <div className="grid gap-6 lg:grid-cols-2">
          {r.diagnostics.vif.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Multicollinearity (VIF)</CardTitle></CardHeader>
              <Table head={["Term", "VIF"]} rows={r.diagnostics.vif.map((v) => [v.term,
                <span key="v" className={v.vif !== null && v.vif > 10 ? "font-semibold text-red-700" : v.vif !== null && v.vif > 5 ? "text-amber-700" : ""}>{fmt(v.vif, 2)}</span>])} />
              <p className="px-5 pb-3 text-xs text-slate-400">&gt; 5 moderate, &gt; 10 severe collinearity.</p>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Influential observations (Cook&apos;s D &gt; {fmt(r.diagnostics.cooks_cutoff, 3)})</CardTitle></CardHeader>
            {r.diagnostics.influential.length === 0
              ? <CardBody className="text-sm text-slate-500">None.</CardBody>
              : <Table head={["Data row", "Cook's D"]} rows={r.diagnostics.influential.map((i) => [i.row + 1, fmt(i.cooks_d)])} />}
          </Card>
        </div>
      )}
    </div>
  );
}

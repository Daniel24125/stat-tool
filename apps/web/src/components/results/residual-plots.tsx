"use client";

import { Plot } from "@/components/plot";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui";

export function ResidualPlots({ res }: { res: { fitted: number[]; resid: number[]; qq_theoretical: number[]; qq_sample: number[] } }) {
  const lo = Math.min(...res.qq_theoretical), hi = Math.max(...res.qq_theoretical);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Residuals vs fitted</CardTitle></CardHeader>
        <CardBody>
          <Plot data={[{ type: "scatter", mode: "markers", x: res.fitted, y: res.resid, marker: { size: 6, opacity: 0.7 } }]}
            layout={{ xaxis: { title: { text: "fitted" } }, yaxis: { title: { text: "residual" }, zeroline: true } }} height={280} />
          <p className="mt-1 text-xs text-slate-400">Look for a random band around 0. A funnel suggests unequal variance; a curve suggests a missing term.</p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>Normal Q-Q plot of residuals</CardTitle></CardHeader>
        <CardBody>
          <Plot data={[{ type: "scatter", mode: "markers", x: res.qq_theoretical, y: res.qq_sample, marker: { size: 6, opacity: 0.7 } },
                       { type: "scatter", mode: "lines", x: [lo, hi], y: [lo, hi], line: { color: "#94a3b8", dash: "dash" } }]}
            layout={{ xaxis: { title: { text: "theoretical quantiles" } }, yaxis: { title: { text: "standardized residuals" } } }} height={280} />
          <p className="mt-1 text-xs text-slate-400">Points close to the line indicate normally distributed residuals.</p>
        </CardBody>
      </Card>
    </div>
  );
}

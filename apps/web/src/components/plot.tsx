"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import dynamic from "next/dynamic";
import type { PlotParams } from "react-plotly.js";

// Plotly touches `window`, so it is loaded only in the browser.
const Plotly = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, { default: PlotlyLib }] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]);
    return createPlotlyComponent(PlotlyLib);
  },
  { ssr: false, loading: () => <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading plot…</div> },
);

export const PALETTE = ["#2f6fed", "#e8590c", "#2b8a3e", "#ae3ec9", "#c92a2a", "#1098ad", "#f08c00", "#5c7cfa"];

export function Plot({ data, layout, height = 320 }: { data: PlotParams["data"]; layout?: Record<string, any>; height?: number }) {
  return (
    <Plotly
      data={data}
      layout={{
        height,
        autosize: true,
        margin: { l: 56, r: 16, t: 24, b: 48 },
        font: { family: "Inter, system-ui, sans-serif", size: 12, color: "#334155" },
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        colorway: PALETTE,
        showlegend: false,
        ...((layout ?? {}) as object),
        // merge axis settings so callers can add titles without losing the grid styling
        xaxis: { gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1", automargin: true, ...((layout?.xaxis ?? {}) as object) },
        yaxis: { gridcolor: "#e2e8f0", zerolinecolor: "#cbd5e1", automargin: true, ...((layout?.yaxis ?? {}) as object) },
      }}
      config={{ displaylogo: false, responsive: true, toImageButtonOptions: { format: "svg", scale: 2 } }}
      useResizeHandler
      style={{ width: "100%" }}
    />
  );
}

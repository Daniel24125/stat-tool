"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Download } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { PlotParams } from "react-plotly.js";
import { toast } from "sonner";

let plotlyLib: any = null;

// Plotly touches `window`, so it is loaded only in the browser.
const Plotly = dynamic(
  async () => {
    const [{ default: createPlotlyComponent }, { default: PlotlyLib }] = await Promise.all([
      import("react-plotly.js/factory"),
      import("plotly.js-dist-min"),
    ]);
    plotlyLib = PlotlyLib;
    return createPlotlyComponent(PlotlyLib);
  },
  { ssr: false, loading: () => <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading plot…</div> },
);

/** Categorical palette tuned to the teal/ink theme; distinct in colour and lightness. */
export const PALETTE = ["#0f6b68", "#c2571a", "#4b5fa8", "#b8901c", "#8a3f7e", "#3f8f3a", "#a33b3b", "#5b7083"];

const FONT = { family: "Hanken Grotesk, system-ui, sans-serif", size: 12, color: "#13232a" };

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "plot";
}

export function Plot({ data, layout, height = 320, name = "plot" }: { data: PlotParams["data"]; layout?: Record<string, any>; height?: number; name?: string }) {
  const graph = useRef<any>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => menu.current && !menu.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  async function exportPng(transparent: boolean) {
    setOpen(false);
    const gd = graph.current;
    if (!gd || !plotlyLib) return;
    const bg = transparent ? "rgba(0,0,0,0)" : "#ffffff";
    const width = gd.offsetWidth || 800;
    // Render a copy so the on-screen chart is untouched.
    const url = await plotlyLib.toImage(
      { data: gd.data, layout: { ...gd.layout, paper_bgcolor: bg, plot_bgcolor: bg, width, height } },
      { format: "png", width, height, scale: 3 },
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(name)}${transparent ? "-transparent" : ""}.png`;
    a.click();
    toast.success(`Exported ${a.download}`);
  }

  return (
    <div className="group relative">
      <div ref={menu} className="absolute right-0 top-0 z-10">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 rounded-[var(--radius-control)] border border-transparent px-2 py-1 text-xs text-slate-500 opacity-70 hover:border-rule hover:bg-white hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        {open && (
          <div role="menu" className="absolute right-0 mt-1 w-52 overflow-hidden rounded-[var(--radius-panel)] border border-rule bg-white py-1 text-sm shadow-[0_6px_24px_-8px_rgba(19,35,42,.25)]">
            <button role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-paper" onClick={() => exportPng(false)}>PNG, white background</button>
            <button role="menuitem" className="block w-full px-3 py-2 text-left hover:bg-paper" onClick={() => exportPng(true)}>PNG, transparent background</button>
            <p className="border-t border-rule/70 px-3 py-1.5 text-xs text-slate-400">3× resolution, suitable for print</p>
          </div>
        )}
      </div>
      <Plotly
        data={data}
        onInitialized={(_, gd) => { graph.current = gd; }}
        onUpdate={(_, gd) => { graph.current = gd; }}
        layout={{
          height,
          autosize: true,
          margin: { l: 56, r: 16, t: 32, b: 48 },
          font: FONT,
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          colorway: PALETTE,
          showlegend: false,
          hoverlabel: { font: FONT, bgcolor: "#ffffff", bordercolor: "#d6dcd9" },
          ...((layout ?? {}) as object),
          // merge axis settings so callers can add titles without losing the grid styling
          xaxis: { gridcolor: "#e6eae8", zerolinecolor: "#c3cbc8", linecolor: "#c3cbc8", automargin: true, ...((layout?.xaxis ?? {}) as object) },
          yaxis: { gridcolor: "#e6eae8", zerolinecolor: "#c3cbc8", linecolor: "#c3cbc8", automargin: true, ...((layout?.yaxis ?? {}) as object) },
        }}
        config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["toImage", "lasso2d", "select2d", "autoScale2d"], displayModeBar: "hover" }}
        useResizeHandler
        style={{ width: "100%" }}
      />
    </div>
  );
}

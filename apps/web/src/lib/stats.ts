import "server-only";
import type { Profile } from "./types";

const base = () => process.env.STATS_API_URL ?? "http://localhost:8000";

async function call<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), "X-Internal-Key": process.env.INTERNAL_API_KEY ?? "" },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json() as Promise<T>;
}

export type AnalysisKind = "outliers" | "compare" | "regression" | "correlation" | "pca" | "pls" | "cluster";

export function analyzeFile(bytes: Uint8Array, fileName: string, spec: { type: AnalysisKind; params: unknown; exclude_rows: number[] }) {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart]), fileName);
  form.append("spec", JSON.stringify(spec));
  return call<Record<string, unknown>>("/v1/analyze", { method: "POST", body: form });
}

export function profileFile(bytes: Uint8Array, fileName: string) {
  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart]), fileName);
  return call<Profile>("/v1/profile", { method: "POST", body: form });
}

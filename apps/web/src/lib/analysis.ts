import "server-only";
import { z } from "zod";
import type { AnalysisType } from "@/generated/prisma/client";
import { db } from "./db";
import { getObject } from "./storage";
import { analyzeFile, type AnalysisKind } from "./stats";

const col = z.string().min(1).max(200);

export const paramSchemas = {
  OUTLIERS: z.object({ columns: z.array(col).min(1).max(50), group_by: col.nullish(), method: z.enum(["auto", "iqr", "mad", "esd", "mcd", "iforest", "lof"]).default("auto") }),
  COMPARE: z.object({ response: col, factors: z.array(col).min(1).max(3), subject: col.nullish() }),
  REGRESSION: z.object({ response: col, predictors: z.array(col).min(1).max(30), categorical: z.array(col).default([]), family: z.enum(["auto", "gaussian", "binomial", "poisson"]).default("auto"), random_effect: col.nullish() }),
  CORRELATION: z.object({ columns: z.array(col).min(2).max(60), method: z.enum(["auto", "pearson", "spearman"]).default("auto") }),
  PCA: z.object({ columns: z.array(col).min(2).max(500), scaling: z.enum(["auto", "autoscale", "pareto", "center"]).default("auto"), n_components: z.number().int().min(2).max(10).nullish(), color_by: col.nullish() }),
  PLS: z.object({ predictors: z.array(col).min(2).max(500), responses: z.array(col).max(20).default([]), class_column: col.nullish(), n_components: z.number().int().min(1).max(10).nullish() })
    .refine((p) => (p.class_column ? p.responses.length === 0 : p.responses.length > 0), "Choose numeric responses (PLS) or a class column (PLS-DA), not both."),
  CLUSTER: z.object({ columns: z.array(col).min(1).max(200), method: z.enum(["auto", "kmeans", "ward"]).default("auto"), k: z.number().int().min(2).max(10).nullish(), compare_with: col.nullish() }),
} satisfies Record<AnalysisType, z.ZodType>;

export function defaultName(type: AnalysisType, p: Record<string, unknown>) {
  switch (type) {
    case "OUTLIERS": return `Outliers in ${(p.columns as string[]).join(", ")}`;
    case "COMPARE": return `${p.response} by ${(p.factors as string[]).join(" × ")}`;
    case "REGRESSION": return `${p.response} ~ ${(p.predictors as string[]).join(" + ")}`;
    case "CORRELATION": return `Correlation of ${(p.columns as string[]).length} variables`;
    case "PCA": return `PCA of ${(p.columns as string[]).length} variables`;
    case "PLS": return p.class_column ? `PLS-DA: ${p.class_column}` : `PLS: ${(p.responses as string[]).join(", ")}`;
    case "CLUSTER": return `Clustering of ${(p.columns as string[]).length} variables`;
  }
}

/** Every column a set of parameters refers to, for checking against a dataset. */
export function columnsUsed(p: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const v of Object.values(p)) {
    if (typeof v === "string" && !["auto", "iqr", "mad", "esd", "mcd", "iforest", "lof", "gaussian", "binomial", "poisson", "pearson", "spearman", "autoscale", "pareto", "center", "kmeans", "ward"].includes(v)) out.push(v);
    if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === "string"));
  }
  return [...new Set(out)];
}

/** Runs one analysis and stores the outcome. Returns the results on success, null on failure. */
export async function executeRun(runId: string, opts: { notify: boolean }) {
  const run = await db.analysisRun.update({ where: { id: runId }, data: { status: "RUNNING" }, include: { dataset: true } });
  const started = Date.now();
  const href = `/projects/${run.projectId}/runs/${run.id}`;
  try {
    const bytes = await getObject(run.dataset.storageKey);
    const results = await analyzeFile(bytes, run.dataset.fileName, {
      type: run.type.toLowerCase() as AnalysisKind,
      params: run.params,
      exclude_rows: run.excludeRows,
    });
    const suggested = run.type === "OUTLIERS" ? ((results.suggested_exclusions as number[]) ?? []) : [];
    await db.analysisRun.update({
      where: { id: runId },
      data: { status: "DONE", results: results as object, exclusions: suggested, durationMs: Date.now() - started, finishedAt: new Date() },
    });
    if (opts.notify) await notifyProject(run.projectId, `Analysis "${run.name}" is ready.`, "run_done", href);
    return results;
  } catch (e) {
    const error = e instanceof Error ? e.message : "Analysis failed.";
    await db.analysisRun.update({ where: { id: runId }, data: { status: "FAILED", error, durationMs: Date.now() - started, finishedAt: new Date() } });
    if (opts.notify) {
      await db.notification.create({ data: { userId: run.createdById, projectId: run.projectId, kind: "run_failed", message: `Analysis "${run.name}" failed: ${error}`, href } });
    }
    return null;
  }
}

export async function notifyProject(projectId: string, message: string, kind: string, href: string) {
  const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true } });
  await db.notification.createMany({ data: members.map((m) => ({ userId: m.userId, projectId, kind, message, href })) });
}

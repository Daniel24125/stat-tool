"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AnalysisType } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";
import { getObject } from "@/lib/storage";
import { analyzeFile, type AnalysisKind } from "@/lib/stats";

const col = z.string().min(1).max(200);
const paramSchemas = {
  OUTLIERS: z.object({ columns: z.array(col).min(1).max(50), group_by: col.nullish(), method: z.enum(["auto", "iqr", "mad", "esd", "mcd", "iforest", "lof"]).default("auto") }),
  COMPARE: z.object({ response: col, factors: z.array(col).min(1).max(3), subject: col.nullish() }),
  REGRESSION: z.object({ response: col, predictors: z.array(col).min(1).max(30), categorical: z.array(col).default([]), family: z.enum(["auto", "gaussian", "binomial", "poisson"]).default("auto"), random_effect: col.nullish() }),
  CORRELATION: z.object({ columns: z.array(col).min(2).max(60), method: z.enum(["auto", "pearson", "spearman"]).default("auto") }),
  PCA: z.object({ columns: z.array(col).min(2).max(500), scaling: z.enum(["auto", "autoscale", "pareto", "center"]).default("auto"), n_components: z.number().int().min(2).max(10).nullish(), color_by: col.nullish() }),
  PLS: z.object({ predictors: z.array(col).min(2).max(500), responses: z.array(col).max(20).default([]), class_column: col.nullish(), n_components: z.number().int().min(1).max(10).nullish() })
    .refine((p) => (p.class_column ? p.responses.length === 0 : p.responses.length > 0), "Choose numeric responses (PLS) or a class column (PLS-DA), not both."),
  CLUSTER: z.object({ columns: z.array(col).min(1).max(200), method: z.enum(["auto", "kmeans", "ward"]).default("auto"), k: z.number().int().min(2).max(10).nullish(), compare_with: col.nullish() }),
} satisfies Record<AnalysisType, z.ZodType>;

function defaultName(type: AnalysisType, p: Record<string, unknown>) {
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

export async function createRun(input: {
  projectId: string;
  datasetId: string;
  type: AnalysisType;
  params: unknown;
  outlierRunId?: string | null;
}): Promise<{ ok: true; runId: string } | { ok: false; error: string }> {
  const user = await currentUser();
  await requireProjectRole(input.projectId, user.id, "EDITOR");

  const dataset = await db.dataset.findFirst({ where: { id: input.datasetId, projectId: input.projectId, status: "READY" } });
  if (!dataset) return { ok: false, error: "Dataset not found or not ready." };

  const parsed = paramSchemas[input.type]?.safeParse(input.params);
  if (!parsed?.success) return { ok: false, error: parsed?.error.issues[0]?.message ?? "Invalid parameters." };

  let excludeRows: number[] = [];
  if (input.outlierRunId) {
    const src = await db.analysisRun.findFirst({
      where: { id: input.outlierRunId, datasetId: dataset.id, type: "OUTLIERS", exclusionsConfirmed: true },
    });
    if (!src) return { ok: false, error: "Choose an outlier run whose exclusions have been confirmed." };
    excludeRows = src.exclusions;
  }

  const params = parsed.data as Record<string, unknown>;
  const run = await db.analysisRun.create({
    data: {
      projectId: input.projectId,
      datasetId: dataset.id,
      type: input.type,
      name: defaultName(input.type, params),
      params: params as object,
      excludeRows,
      sourceRunId: input.outlierRunId ?? null,
      createdById: user.id,
    },
  });

  // Runs after the response is sent; the user is notified when it finishes.
  after(() => executeRun(run.id));
  revalidatePath(`/projects/${input.projectId}/datasets/${dataset.id}`);
  return { ok: true, runId: run.id };
}

async function executeRun(runId: string) {
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
    await notify(run.projectId, `Analysis "${run.name}" is ready.`, "run_done", href);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Analysis failed.";
    await db.analysisRun.update({ where: { id: runId }, data: { status: "FAILED", error, durationMs: Date.now() - started, finishedAt: new Date() } });
    await db.notification.create({ data: { userId: run.createdById, projectId: run.projectId, kind: "run_failed", message: `Analysis "${run.name}" failed: ${error}`, href } });
  }
}

async function notify(projectId: string, message: string, kind: string, href: string) {
  const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true } });
  await db.notification.createMany({ data: members.map((m) => ({ userId: m.userId, projectId, kind, message, href })) });
}

/** Save which flagged rows the user wants removed in later analyses. */
export async function confirmExclusions(projectId: string, runId: string, rows: number[]) {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  const run = await db.analysisRun.findFirst({ where: { id: runId, projectId, type: "OUTLIERS", status: "DONE" } });
  if (!run) return { ok: false as const, error: "Run not found." };
  const flagged = new Set(((run.results as { flagged?: { row: number }[] })?.flagged ?? []).map((f) => f.row));
  const clean = [...new Set(rows)].filter((r) => flagged.has(r)).sort((a, b) => a - b);
  await db.analysisRun.update({ where: { id: runId }, data: { exclusions: clean, exclusionsConfirmed: true } });
  revalidatePath(`/projects/${projectId}/runs/${runId}`);
  return { ok: true as const, count: clean.length };
}

export async function deleteRun(projectId: string, runId: string) {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  const run = await db.analysisRun.delete({ where: { id: runId, projectId } });
  revalidatePath(`/projects/${projectId}/datasets/${run.datasetId}`);
  return { ok: true as const, datasetId: run.datasetId };
}

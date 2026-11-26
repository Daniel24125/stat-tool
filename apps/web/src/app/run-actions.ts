"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { AnalysisType } from "@/generated/prisma/client";
import { defaultName, executeRun, paramSchemas } from "@/lib/analysis";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";

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
  after(() => executeRun(run.id, { notify: true }));
  revalidatePath(`/projects/${input.projectId}/datasets/${dataset.id}`);
  return { ok: true, runId: run.id };
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

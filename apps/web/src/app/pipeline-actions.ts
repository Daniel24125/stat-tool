"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import { missingColumns, runPipeline, stepsSchema, type PipelineStep } from "@/lib/pipelines";
import { currentUser } from "@/lib/session";
import type { Profile } from "@/lib/types";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const meta = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional() });

export async function savePipeline(input: { projectId: string; pipelineId?: string; name: string; description?: string; steps: unknown }): Promise<Result<{ pipelineId: string }>> {
  const user = await currentUser();
  await requireProjectRole(input.projectId, user.id, "EDITOR");
  const m = meta.safeParse({ name: input.name, description: input.description || undefined });
  if (!m.success) return { ok: false, error: "Give the pipeline a name." };
  const s = stepsSchema.safeParse(input.steps);
  if (!s.success) return { ok: false, error: s.error.issues[0]?.message ?? "Invalid steps." };

  if (input.pipelineId) {
    const existing = await db.pipeline.findFirst({ where: { id: input.pipelineId, projectId: input.projectId } });
    if (!existing) return { ok: false, error: "Pipeline not found." };
    await db.pipeline.update({ where: { id: existing.id }, data: { ...m.data, steps: s.data as object } });
    revalidatePath(`/projects/${input.projectId}/pipelines/${existing.id}`);
    return { ok: true, pipelineId: existing.id };
  }
  const p = await db.pipeline.create({ data: { projectId: input.projectId, ...m.data, steps: s.data as object, createdById: user.id } });
  revalidatePath(`/projects/${input.projectId}`);
  return { ok: true, pipelineId: p.id };
}

export async function deletePipeline(projectId: string, pipelineId: string) {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  await db.pipeline.delete({ where: { id: pipelineId, projectId } });
  redirect(`/projects/${projectId}`);
}

export async function startPipelineRun(projectId: string, pipelineId: string, datasetId: string): Promise<Result<{ runId: string }>> {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  const [pipeline, dataset] = await Promise.all([
    db.pipeline.findFirst({ where: { id: pipelineId, projectId } }),
    db.dataset.findFirst({ where: { id: datasetId, projectId, status: "READY" } }),
  ]);
  if (!pipeline) return { ok: false, error: "Pipeline not found." };
  if (!dataset?.profile) return { ok: false, error: "Dataset not found or not ready." };

  const steps = pipeline.steps as unknown as PipelineStep[];
  const missing = missingColumns(steps, dataset.profile as unknown as Profile);
  if (missing.length) return { ok: false, error: `This dataset has no column(s): ${missing.join(", ")}.` };

  const run = await db.pipelineRun.create({
    data: { pipelineId, projectId, datasetId, steps: steps as object, createdById: user.id },
  });
  after(() => runPipeline(run.id));
  return { ok: true, runId: run.id };
}

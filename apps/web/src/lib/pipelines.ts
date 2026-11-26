import "server-only";
import { z } from "zod";
import type { AnalysisType } from "@/generated/prisma/client";
import { columnsUsed, defaultName, executeRun, notifyProject, paramSchemas } from "./analysis";
import { db } from "./db";
import type { Profile } from "./types";

const TYPES = ["OUTLIERS", "COMPARE", "REGRESSION", "CORRELATION", "PCA", "PLS", "CLUSTER"] as const;

/**
 * One pipeline step. COMPARE steps take a list of responses and run one
 * comparison per response, which is how a whole panel of measurements is
 * screened in one go. OUTLIERS steps can pass their suggested exclusions on
 * to every later step.
 */
export const stepSchema = z
  .object({
    id: z.string().min(1).max(40),
    type: z.enum(TYPES),
    label: z.string().max(120).optional(),
    params: z.record(z.string(), z.unknown()),
    apply_exclusions: z.boolean().optional(),
  })
  .superRefine((step, ctx) => {
    const variants = expand(step as PipelineStep);
    for (const v of variants) {
      const r = paramSchemas[step.type].safeParse(v);
      if (!r.success) ctx.addIssue({ code: "custom", message: `${step.label || step.type}: ${r.error.issues[0]?.message}` });
    }
    if (variants.length === 0) ctx.addIssue({ code: "custom", message: `${step.label || step.type}: choose at least one response.` });
  });

export const stepsSchema = z.array(stepSchema).min(1, "Add at least one step.").max(30);
export type PipelineStep = { id: string; type: AnalysisType; label?: string; params: Record<string, unknown>; apply_exclusions?: boolean };

/** Parameter sets a step turns into (one per response for COMPARE). */
export function expand(step: PipelineStep): Record<string, unknown>[] {
  if (step.type === "COMPARE" && Array.isArray(step.params.responses)) {
    const { responses, ...rest } = step.params as { responses: string[] };
    return responses.map((response) => ({ ...rest, response }));
  }
  return [step.params];
}

/** Columns the pipeline needs that the dataset doesn't have. */
export function missingColumns(steps: PipelineStep[], profile: Profile): string[] {
  const have = new Set(profile.columns.map((c) => c.name));
  const need = new Set(steps.flatMap((s) => expand(s).flatMap((p) => columnsUsed(p))));
  return [...need].filter((c) => !have.has(c));
}

/** Runs every step in order; called in the background after the request returns. */
export async function runPipeline(pipelineRunId: string) {
  try {
    await runSteps(pipelineRunId);
  } catch (e) {
    // Never leave a run stuck in RUNNING.
    const pr = await db.pipelineRun.update({
      where: { id: pipelineRunId },
      data: { status: "FAILED", error: e instanceof Error ? e.message : "Pipeline failed.", finishedAt: new Date() },
    });
    await db.notification.create({
      data: { userId: pr.createdById, projectId: pr.projectId, kind: "pipeline_failed", message: "A pipeline run failed.", href: `/projects/${pr.projectId}/pipeline-runs/${pr.id}` },
    });
  }
}

async function runSteps(pipelineRunId: string) {
  const pr = await db.pipelineRun.update({ where: { id: pipelineRunId }, data: { status: "RUNNING" }, include: { pipeline: true } });
  const steps = pr.steps as unknown as PipelineStep[];
  let excluded: number[] = [];
  let failures = 0;

  for (const [i, step] of steps.entries()) {
    await db.pipelineRun.update({ where: { id: pr.id }, data: { currentStep: i } });
    for (const raw of expand(step)) {
      const params = paramSchemas[step.type].parse(raw) as Record<string, unknown>;
      const run = await db.analysisRun.create({
        data: {
          projectId: pr.projectId,
          datasetId: pr.datasetId,
          type: step.type,
          name: `${i + 1}. ${step.label || defaultName(step.type, params)}${expand(step).length > 1 ? ` (${params.response})` : ""}`,
          params: params as object,
          excludeRows: excluded,
          pipelineRunId: pr.id,
          stepIndex: i,
          createdById: pr.createdById,
        },
      });
      const results = await executeRun(run.id, { notify: false });
      if (!results) {
        failures++;
        continue;
      }
      if (step.type === "OUTLIERS" && step.apply_exclusions) {
        const suggested = (results.suggested_exclusions as number[]) ?? [];
        excluded = [...new Set([...excluded, ...suggested])].sort((a, b) => a - b);
        // Recorded as confirmed so the exclusions are visible and reusable, and attributable to the pipeline.
        await db.analysisRun.update({ where: { id: run.id }, data: { exclusionsConfirmed: true, exclusions: suggested } });
      }
    }
  }

  const total = steps.reduce((n, s) => n + expand(s).length, 0);
  await db.pipelineRun.update({
    where: { id: pr.id },
    data: {
      status: failures === total ? "FAILED" : "DONE",
      excludedRows: excluded,
      currentStep: steps.length,
      error: failures ? `${failures} of ${total} analyses failed.` : null,
      finishedAt: new Date(),
    },
  });
  await notifyProject(
    pr.projectId,
    failures ? `Pipeline "${pr.pipeline.name}" finished with ${failures} failed analysis(es).` : `Pipeline "${pr.pipeline.name}" finished (${total} analyses).`,
    failures ? "pipeline_partial" : "pipeline_done",
    `/projects/${pr.projectId}/pipeline-runs/${pr.id}`,
  );
}

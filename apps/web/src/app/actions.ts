"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import { checkFile, createDatasetFromFile } from "@/lib/datasets";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import { runPipeline, stepsSchema } from "@/lib/pipelines";
import { currentUser } from "@/lib/session";
import { deleteObject } from "@/lib/storage";
import { profileFile } from "@/lib/stats";
import { BUILT_IN_TEMPLATES, bindTemplate, type TemplateStep } from "@/lib/templates";
import type { Profile } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const roleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]);

async function notifyMembers(projectId: string, exceptUserId: string | null, kind: string, message: string, href?: string) {
  const members = await db.projectMember.findMany({ where: { projectId }, select: { userId: true } });
  const data = members
    .filter((m) => m.userId !== exceptUserId)
    .map((m) => ({ userId: m.userId, projectId, kind, message, href }));
  if (data.length) await db.notification.createMany({ data });
}

// ---------- projects ----------

export async function createProject(formData: FormData) {
  const user = await currentUser();
  const parsed = z
    .object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(500).optional() })
    .parse({ name: formData.get("name"), description: formData.get("description") || undefined });

  const project = await db.project.create({
    data: { ...parsed, members: { create: { userId: user.id, role: "OWNER" } } },
  });
  redirect(`/projects/${project.id}`);
}

export async function deleteProject(projectId: string) {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "OWNER");
  const datasets = await db.dataset.findMany({ where: { projectId }, select: { storageKey: true } });
  await db.project.delete({ where: { id: projectId } });
  await Promise.allSettled(datasets.map((d) => deleteObject(d.storageKey)));
  redirect("/dashboard");
}

// ---------- members ----------

export async function addMember(projectId: string, userId: string, role: Role): Promise<ActionResult> {
  const me = await currentUser();
  await requireProjectRole(projectId, me.id, "OWNER");
  roleSchema.parse(role);

  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) return { ok: false, error: "User not found." };
  const existing = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (existing) return { ok: false, error: "Already a member." };

  const project = await db.projectMember.create({ data: { projectId, userId, role }, include: { project: true } });
  await db.notification.create({
    data: {
      userId,
      projectId,
      kind: "member_added",
      message: `${me.name ?? me.email} added you to "${project.project.name}" as ${role.toLowerCase()}.`,
      href: `/projects/${projectId}`,
    },
  });
  revalidatePath(`/projects/${projectId}/settings`);
  return { ok: true };
}

async function ownerCount(projectId: string) {
  return db.projectMember.count({ where: { projectId, role: "OWNER" } });
}

export async function updateMemberRole(projectId: string, userId: string, role: Role): Promise<ActionResult> {
  const me = await currentUser();
  await requireProjectRole(projectId, me.id, "OWNER");
  roleSchema.parse(role);
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (!member) return { ok: false, error: "Not a member." };
  if (member.role === "OWNER" && role !== "OWNER" && (await ownerCount(projectId)) === 1) {
    return { ok: false, error: "A project needs at least one owner." };
  }
  await db.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role } });
  if (userId !== me.id) {
    await db.notification.create({
      data: { userId, projectId, kind: "role_changed", message: `Your role was changed to ${role.toLowerCase()}.`, href: `/projects/${projectId}` },
    });
  }
  revalidatePath(`/projects/${projectId}/settings`);
  return { ok: true };
}

export async function removeMember(projectId: string, userId: string): Promise<ActionResult> {
  const me = await currentUser();
  // Members may leave on their own; removing others needs OWNER.
  await requireProjectRole(projectId, me.id, userId === me.id ? "VIEWER" : "OWNER");
  const member = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (!member) return { ok: false, error: "Not a member." };
  if (member.role === "OWNER" && (await ownerCount(projectId)) === 1) {
    return { ok: false, error: "A project needs at least one owner." };
  }
  await db.projectMember.delete({ where: { projectId_userId: { projectId, userId } } });
  revalidatePath(`/projects/${projectId}/settings`);
  return { ok: true };
}

// ---------- datasets ----------

export async function uploadDataset(projectId: string, formData: FormData): Promise<ActionResult & { datasetId?: string }> {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");

  const file = formData.get("file");
  const bad = checkFile(file);
  if (bad) return { ok: false, error: bad };

  const r = await createDatasetFromFile(projectId, user.id, file as File, (formData.get("name") as string | null) ?? undefined);
  const href = `/projects/${projectId}/datasets/${r.dataset.id}`;
  revalidatePath(`/projects/${projectId}`);
  if (!r.ok) {
    await db.notification.create({
      data: { userId: user.id, projectId, kind: "dataset_failed", message: `Profiling "${r.dataset.name}" failed: ${r.error}`, href },
    });
    return { ok: false, error: r.error };
  }
  await notifyMembers(projectId, null, "dataset_ready", `Dataset "${r.dataset.name}" is profiled and ready.`, href);
  return { ok: true, datasetId: r.dataset.id };
}

/** Profile a file without storing it, so the new-project dialog can offer column choices. */
export async function previewDataset(formData: FormData): Promise<{ ok: true; profile: Profile } | { ok: false; error: string }> {
  await currentUser();
  const file = formData.get("file");
  const bad = checkFile(file);
  if (bad) return { ok: false, error: bad };
  try {
    const f = file as File;
    return { ok: true, profile: await profileFile(new Uint8Array(await f.arrayBuffer()), f.name) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the file." };
  }
}

const setupSchema = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(120),
  description: z.string().trim().max(500).optional(),
  templateId: z.string().max(60).nullish(),
  roles: z.object({ responses: z.array(z.string().max(200)).max(200), factors: z.array(z.string().max(200)).max(3), subject: z.string().max(200).nullish() }).nullish(),
  members: z.array(z.object({ userId: z.string().max(40), role: roleSchema })).max(50).default([]),
});

/**
 * Create a project with its first dataset, members and a pipeline from a
 * template, all from the new-project dialog. Only the project name is required.
 */
export async function createProjectWithSetup(formData: FormData): Promise<{ ok: true; href: string; warnings: string[] } | { ok: false; error: string }> {
  const user = await currentUser();
  let input: z.infer<typeof setupSchema>;
  try {
    input = setupSchema.parse(JSON.parse(String(formData.get("setup") ?? "{}")));
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0]?.message ?? "Invalid input." : "Invalid input." };
  }
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) {
    const bad = checkFile(file);
    if (bad) return { ok: false, error: bad };
  }

  const project = await db.project.create({
    data: { name: input.name, description: input.description || null, members: { create: { userId: user.id, role: "OWNER" } } },
  });
  const warnings: string[] = [];
  let href = `/projects/${project.id}`;

  // members: only existing StatTool users; never the creator twice
  const wanted = input.members.filter((m) => m.userId !== user.id);
  if (wanted.length) {
    const found = await db.user.findMany({ where: { id: { in: wanted.map((m) => m.userId) } }, select: { id: true } });
    const ok = new Set(found.map((u) => u.id));
    const add = wanted.filter((m) => ok.has(m.userId));
    await db.projectMember.createMany({ data: add.map((m) => ({ projectId: project.id, userId: m.userId, role: m.role })), skipDuplicates: true });
    await db.notification.createMany({
      data: add.map((m) => ({ userId: m.userId, projectId: project.id, kind: "member_added", message: `${user.name ?? user.email} added you to "${project.name}" as ${m.role.toLowerCase()}.`, href })),
    });
  }

  if (hasFile) {
    const r = await createDatasetFromFile(project.id, user.id, file as File);
    href = `/projects/${project.id}/datasets/${r.dataset.id}`;
    if (!r.ok) {
      warnings.push(`The project was created, but the dataset could not be read: ${r.error}`);
    } else if (input.templateId && input.roles) {
      const template = BUILT_IN_TEMPLATES.find((t) => t.id === input.templateId)
        ?? (await db.pipelineTemplate.findFirst({ where: { id: input.templateId, ownerId: user.id } }));
      if (!template) {
        warnings.push("The selected template no longer exists; no pipeline was created.");
      } else {
        const cols = new Set(r.profile.columns.map((c) => c.name));
        const roles = {
          responses: input.roles.responses.filter((c) => cols.has(c)),
          factors: input.roles.factors.filter((c) => cols.has(c)),
          subject: input.roles.subject && cols.has(input.roles.subject) ? input.roles.subject : null,
        };
        const bound = bindTemplate(template.steps as TemplateStep[], roles);
        if (bound.skipped.length) warnings.push(`Skipped: ${bound.skipped.join("; ")}.`);
        const steps = stepsSchema.safeParse(bound.steps);
        if (!steps.success) {
          warnings.push(`The pipeline could not be created: ${steps.error.issues[0]?.message}`);
        } else {
          const pipeline = await db.pipeline.create({
            data: { projectId: project.id, name: template.name, description: template.description ?? null, steps: steps.data as object, createdById: user.id },
          });
          const run = await db.pipelineRun.create({
            data: { pipelineId: pipeline.id, projectId: project.id, datasetId: r.dataset.id, steps: steps.data as object, createdById: user.id },
          });
          after(() => runPipeline(run.id));
          href = `/projects/${project.id}/pipeline-runs/${run.id}`;
        }
      }
    }
  }

  revalidatePath("/dashboard");
  return { ok: true, href, warnings };
}

export async function deleteDataset(projectId: string, datasetId: string) {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  const ds = await db.dataset.delete({ where: { id: datasetId, projectId } });
  await deleteObject(ds.storageKey).catch(() => {});
  redirect(`/projects/${projectId}`);
}

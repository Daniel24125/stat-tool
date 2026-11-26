"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireProjectRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";
import { deleteObject, putObject } from "@/lib/storage";
import { profileFile } from "@/lib/stats";

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

const ALLOWED = /\.(csv|tsv|txt|xlsx|xls)$/i;
const MAX_BYTES = 50 * 1024 * 1024;

export async function uploadDataset(projectId: string, formData: FormData): Promise<ActionResult & { datasetId?: string }> {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  if (!ALLOWED.test(file.name)) return { ok: false, error: "Use CSV, TSV or XLSX." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File is larger than 50 MB." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `projects/${projectId}/datasets/${randomUUID()}/${file.name.replace(/[^\w.\-]/g, "_")}`;
  const name = (formData.get("name") as string | null)?.trim() || file.name.replace(/\.[^.]+$/, "");

  await putObject(storageKey, bytes, file.type || "application/octet-stream");
  const dataset = await db.dataset.create({
    data: { projectId, name, fileName: file.name, storageKey, sizeBytes: file.size, sha256, createdById: user.id },
  });

  // Phase 1 profiles synchronously; analysis runs (phase 2+) go to the stats
  // service as background jobs and notify on completion.
  try {
    const profile = await profileFile(bytes, file.name);
    await db.dataset.update({
      where: { id: dataset.id },
      data: { status: "READY", profile: profile as object, nRows: profile.n_rows, nCols: profile.n_cols },
    });
    await notifyMembers(projectId, null, "dataset_ready", `Dataset "${name}" is profiled and ready.`, `/projects/${projectId}/datasets/${dataset.id}`);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Profiling failed.";
    await db.dataset.update({ where: { id: dataset.id }, data: { status: "FAILED", error } });
    await db.notification.create({
      data: { userId: user.id, projectId, kind: "dataset_failed", message: `Profiling "${name}" failed: ${error}`, href: `/projects/${projectId}/datasets/${dataset.id}` },
    });
    revalidatePath(`/projects/${projectId}`);
    return { ok: false, error };
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, datasetId: dataset.id };
}

export async function deleteDataset(projectId: string, datasetId: string) {
  const user = await currentUser();
  await requireProjectRole(projectId, user.id, "EDITOR");
  const ds = await db.dataset.delete({ where: { id: datasetId, projectId } });
  await deleteObject(ds.storageKey).catch(() => {});
  redirect(`/projects/${projectId}`);
}

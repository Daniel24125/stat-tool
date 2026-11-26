"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { BUILT_IN_TEMPLATES } from "@/lib/templates";

const stepSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(["OUTLIERS", "COMPARE", "REGRESSION", "CORRELATION", "PCA", "PLS", "CLUSTER"]),
  label: z.string().trim().max(120).optional(),
  apply_exclusions: z.boolean().optional(),
});
const templateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(120),
  description: z.string().trim().max(500).optional(),
  steps: z.array(stepSchema).min(1, "Add at least one step.").max(20),
});

export async function saveTemplate(input: { id?: string; name: string; description?: string; steps: unknown }) {
  const user = await currentUser();
  const t = templateSchema.safeParse({ ...input, description: input.description || undefined });
  if (!t.success) return { ok: false as const, error: t.error.issues[0]?.message ?? "Invalid template." };
  if (input.id) {
    const existing = await db.pipelineTemplate.findFirst({ where: { id: input.id, ownerId: user.id } });
    if (!existing) return { ok: false as const, error: "Template not found." };
    await db.pipelineTemplate.update({ where: { id: existing.id }, data: { ...t.data, steps: t.data.steps } });
    revalidatePath("/templates");
    return { ok: true as const, id: existing.id };
  }
  const created = await db.pipelineTemplate.create({ data: { ownerId: user.id, ...t.data, steps: t.data.steps } });
  revalidatePath("/templates");
  return { ok: true as const, id: created.id };
}

export async function duplicateTemplate(id: string) {
  const user = await currentUser();
  const src = BUILT_IN_TEMPLATES.find((t) => t.id === id) ?? (await db.pipelineTemplate.findFirst({ where: { id, ownerId: user.id } }));
  if (!src) return;
  const copy = await db.pipelineTemplate.create({
    data: { ownerId: user.id, name: `${src.name} (copy)`, description: src.description ?? undefined, steps: src.steps as object },
  });
  redirect(`/templates/${copy.id}`);
}

export async function deleteTemplate(id: string) {
  const user = await currentUser();
  await db.pipelineTemplate.deleteMany({ where: { id, ownerId: user.id } });
  redirect("/templates");
}

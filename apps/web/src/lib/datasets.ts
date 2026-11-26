import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { putObject } from "./storage";
import { profileFile } from "./stats";

export const ALLOWED_FILE = /\.(csv|tsv|txt|xlsx|xls)$/i;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function checkFile(file: unknown): string | null {
  if (!(file instanceof File) || file.size === 0) return "Choose a file.";
  if (!ALLOWED_FILE.test(file.name)) return "Use a CSV, TSV or XLSX file.";
  if (file.size > MAX_FILE_BYTES) return "The file is larger than 50 MB.";
  return null;
}

/** Store the file, create the dataset and profile it. Throws nothing: failures are recorded on the dataset. */
export async function createDatasetFromFile(projectId: string, userId: string, file: File, name?: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `projects/${projectId}/datasets/${randomUUID()}/${file.name.replace(/[^\w.\-]/g, "_")}`;
  const dsName = name?.trim() || file.name.replace(/\.[^.]+$/, "");

  await putObject(storageKey, bytes, file.type || "application/octet-stream");
  const dataset = await db.dataset.create({
    data: { projectId, name: dsName, fileName: file.name, storageKey, sizeBytes: file.size, sha256, createdById: userId },
  });
  try {
    const profile = await profileFile(bytes, file.name);
    const ready = await db.dataset.update({
      where: { id: dataset.id },
      data: { status: "READY", profile: profile as object, nRows: profile.n_rows, nCols: profile.n_cols },
    });
    return { ok: true as const, dataset: ready, profile };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Profiling failed.";
    const failed = await db.dataset.update({ where: { id: dataset.id }, data: { status: "FAILED", error } });
    return { ok: false as const, dataset: failed, error };
  }
}

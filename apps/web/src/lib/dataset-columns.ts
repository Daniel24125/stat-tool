import "server-only";
import { db } from "./db";
import type { Profile } from "./types";

/** Ready datasets of a project with their profiled columns (for pickers). */
export async function datasetColumns(projectId: string) {
  const ds = await db.dataset.findMany({ where: { projectId, status: "READY" }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, profile: true } });
  return ds.map((d) => ({ id: d.id, name: d.name, columns: (d.profile as unknown as Profile).columns }));
}

import "server-only";
import { notFound } from "next/navigation";
import type { Role } from "@/generated/prisma/client";
import { db } from "./db";

const RANK: Record<Role, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

export class ForbiddenError extends Error {}

export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

/** Returns the caller's membership, or 404s (so project existence isn't leaked). */
export async function requireProjectRole(projectId: string, userId: string, min: Role = "VIEWER") {
  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) notFound();
  if (!hasRole(membership.role, min)) throw new ForbiddenError(`Requires ${min} role.`);
  return membership;
}

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";
import { maskEmail } from "@/lib/utils";

/**
 * Member search. Reads only StatTool's own User table (people who have logged
 * in to this app), never the Auth0 tenant. With a projectId, only that
 * project's owners may search and existing members are left out; without one
 * (the new-project dialog), any signed-in user may search and is left out.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (q.length < 3) return NextResponse.json({ users: [] });

  if (projectId) {
    const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: me.id } } });
    if (!membership || !hasRole(membership.role, "OWNER")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const users = await db.user.findMany({
    where: {
      id: { not: me.id },
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { startsWith: q, mode: "insensitive" } }],
      ...(projectId ? { memberships: { none: { projectId } } } : {}),
    },
    take: 8,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, picture: true },
  });

  return NextResponse.json({
    users: users.map((u) => ({ id: u.id, name: u.name, email: maskEmail(u.email), picture: u.picture })),
  });
}

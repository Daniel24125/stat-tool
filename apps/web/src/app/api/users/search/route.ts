import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { hasRole } from "@/lib/permissions";
import { currentUser } from "@/lib/session";
import { maskEmail } from "@/lib/utils";

/**
 * Member search for the share dialog. Reads only StatTool's own User table
 * (users who have logged in to this app), never the Auth0 tenant.
 * Only project owners may search; results exclude existing members.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser();
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  if (q.length < 3) return NextResponse.json({ users: [] });

  const membership = await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: me.id } } });
  if (!membership || !hasRole(membership.role, "OWNER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await db.user.findMany({
    where: {
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { startsWith: q, mode: "insensitive" } }],
      memberships: { none: { projectId } },
    },
    take: 8,
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, picture: true },
  });

  return NextResponse.json({
    users: users.map((u) => ({ id: u.id, name: u.name, email: maskEmail(u.email), picture: u.picture })),
  });
}

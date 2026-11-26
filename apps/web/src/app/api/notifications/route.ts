import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";

export async function GET() {
  const me = await currentUser();
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.notification.count({ where: { userId: me.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
}

/** Body: { ids?: string[] } — omit ids to mark all as read. */
export async function POST(req: NextRequest) {
  // Reject cross-site requests (CSRF); browsers always send Sec-Fetch-Site.
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const me = await currentUser();
  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.ids !== undefined && !(Array.isArray(body.ids) && body.ids.every((i) => typeof i === "string"))) {
    return NextResponse.json({ error: "ids must be a list of strings" }, { status: 400 });
  }
  await db.notification.updateMany({
    where: { userId: me.id, readAt: null, ...(body.ids ? { id: { in: body.ids as string[] } } : {}) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

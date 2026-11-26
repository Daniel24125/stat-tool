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
  const me = await currentUser();
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  await db.notification.updateMany({
    where: { userId: me.id, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) },
    data: { readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  const db = getDb();
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  const messages = db
    .prepare(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`,
    )
    .all(id);
  return NextResponse.json({ session, messages });
}

export async function DELETE(
  _req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  const db = getDb();
  const result = db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
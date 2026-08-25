import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getRecoverablePlan } from "@/lib/agent/plan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 分页大小：一次最多返回多少条消息
const PAGE_SIZE = 50;

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  const db = getDb();
  const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id);
  if (!session) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }

  // 分页参数：
  // - limit：一页多少条（默认 PAGE_SIZE，最大 100）
  // - before：上一页里最旧一条的 created_at，取比它更早的消息（倒着翻页）
  // 查询按 created_at 倒序取 limit+1 条：多取 1 条用来判断还有没有更早的（hasMore）
  const limitParam = req.nextUrl.searchParams.get("limit");
  const parsedLimit = parseInt(limitParam ?? "", 10);
  const limit = Math.min(
    Math.max(Number.isNaN(parsedLimit) ? PAGE_SIZE : parsedLimit, 1),
    100,
  );
  const beforeParam = req.nextUrl.searchParams.get("before");
  const before = beforeParam != null ? parseInt(beforeParam, 10) : null;

  const rows =
    before == null || Number.isNaN(before)
      ? db
          .prepare(
            `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?`,
          )
          .all(id, limit + 1)
      : db
          .prepare(
            `SELECT * FROM messages WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
          )
          .all(id, before, limit + 1);

  const hasMore = rows.length > limit;
  // 裁掉多取的那 1 条，再倒回正序（ASC）给前端展示
  const messages = (hasMore ? rows.slice(0, limit) : rows).reverse();

  // 断点恢复：顺带返回该会话「可恢复的未完成计划」（running / stopped）。
  // 前端据此在最后一次中断的那条 assistant 消息上重画进度面板 + 「继续 / 放弃」入口。
  // 只在首页（before 为空）返回；翻更早的历史页时不需要，也避免重复携带。
  const plan = before == null ? getRecoverablePlan(db, id) : null;

  return NextResponse.json({ session, messages, hasMore, plan });
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
export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { title?: string } | null;
  const title = body?.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "标题不能为空" }, { status: 400 });
  }
  const db = getDb();
  const result = db
    .prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`)
    .run(title, Date.now(), id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, title });
}

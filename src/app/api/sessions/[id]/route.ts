import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getRecoverablePlan } from "@/lib/agent/plan-store";
import { healOrphanRunningState } from "@/lib/agent/turn-lock";

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

  // 排序带 rowid 作第二排序键：同毫秒落库的 user/assistant 消息 created_at
  // 完全相同，仅按 created_at 排序时两次查询的相对次序可能不稳定（回复跑到
  // 提问前面）。rowid 是插入序号，天然单调递增，用它做 tiebreaker 即可稳定
  // 还原真实先后。取回后 .reverse() 翻成正序给前端，tiebreaker 随之一起翻转，
  // 顺序依然正确。
  // （已知边界：翻页游标只传 created_at，若上一页恰好截断在同一毫秒的两条消息
  // 之间，下一页 `created_at < ?` 会把同毫秒的另一条一并跳过。概率极低且修复
  // 需要前后端联动升级复合游标，暂记为已知限制。）
  const rows =
    before == null || Number.isNaN(before)
      ? db
          .prepare(
            `SELECT * FROM messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
          )
          .all(id, limit + 1)
      : db
          .prepare(
            `SELECT * FROM messages WHERE session_id = ? AND created_at < ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
          )
          .all(id, before, limit + 1);

  const hasMore = rows.length > limit;
  // 裁掉多取的那 1 条，再倒回正序（ASC）给前端展示
  const messages = (hasMore ? rows.slice(0, limit) : rows).reverse();

  // 断点恢复：顺带返回该会话「可恢复的未完成计划」（running / stopped）。
  // 前端据此在最后一次中断的那条 assistant 消息上重画进度面板 + 「继续 / 放弃」入口。
  // 只在首页（before 为空）返回；翻更早的历史页时不需要，也避免重复携带。
  //
  // 读取前先做崩溃残留自愈：若进程重启过，DB 里的 running 计划 / running 占位
  // 消息都是上个进程的孤儿数据（本进程锁集合为空即证明没人真在跑）。不修的话，
  // 前端会把假死的「生成中」气泡和永远点不通的「继续」按钮一起渲染出来。
  // 自愈后残留统一变 stopped，前端正确显示「已中断 + 继续/放弃」，resume 链路可接管。
  if (before == null) healOrphanRunningState(db, id);
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

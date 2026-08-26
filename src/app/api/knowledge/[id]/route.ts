// 知识条目单条路由（K1 状态流转 + K3 前置回收站动作）。
//
// 对应 store 的单条操作：读一条 / 改字段（含状态流转）/ 删除。
// 拍板动作（保留 kept / 放弃 discarded）就是 PATCH status，
// 前端不发明新动词，状态机只有一份数据层语义。
//
// 回收站动作走 PATCH { action } 而不是改 status：进出回收站要同步维护
// deleted_at 时间戳，store 层已禁止直接 PATCH status 到 trashed（状态机保护）。

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  deleteItem,
  getItem,
  restoreItem,
  setTags,
  trashItem,
  updateItem,
  type KnowledgeStatus,
  type UpdateItemPatch,
} from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/knowledge/[id]">;

const STATUSES: readonly string[] = ["inbox", "kept", "discarded", "trashed"];
const ACTIONS: readonly string[] = ["trash", "restore"];

// GET /api/knowledge/[id] —— 单条详情
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const item = getItem(getDb(), id);
  if (!item) {
    return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
  }
  return NextResponse.json(item);
}

// PATCH /api/knowledge/[id]
// body: { title?, content?, status?, tags? } 或 { action: "trash" | "restore" }
// tags 走全量替换语义（setTags），与「编辑完整集合后提交」的 UI 交互对齐
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须是 JSON 对象" }, { status: 400 });
  }

  // 回收站动作分支：trash=软删进站、restore=捞回。单独成支是因为它们
  // 不是普通字段修改，而是带副作用的状态迁移（deleted_at 的维护在 store 内完成）
  if (body.action !== undefined) {
    if (!ACTIONS.includes(String(body.action))) {
      return NextResponse.json(
        { error: `action 仅允许 ${ACTIONS.join(" / ")}` },
        { status: 400 },
      );
    }
    try {
      const db = getDb();
      const result =
        body.action === "trash" ? trashItem(db, id) : restoreItem(db, id);
      if (!result) {
        // 不存在，或当前状态不允许该动作（如 inbox 条目不能进回收站）
        return NextResponse.json(
          { error: "条目不存在或当前状态不支持该动作" },
          { status: 409 },
        );
      }
      return NextResponse.json(result);
    } catch (e) {
      console.error("[knowledge:action]", e);
      return NextResponse.json({ error: "回收站操作失败" }, { status: 500 });
    }
  }

  // 非法状态在这里拦成 400；store 的 assertStatus 是最后一道闸（防内部调用方传错）
  if (body.status !== undefined && !STATUSES.includes(String(body.status))) {
    return NextResponse.json(
      { error: `status 仅允许 ${STATUSES.join(" / ")}` },
      { status: 400 },
    );
  }

  const patch: UpdateItemPatch = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.content === "string") patch.content = body.content;
  if (body.status !== undefined) patch.status = body.status as KnowledgeStatus;

  try {
    const db = getDb();
    if (!getItem(db, id)) {
      return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
    }
    let updated = updateItem(db, id, patch);
    // tags 与字段更新同批提交：先改字段再全量替换标签，updated_at 都会刷新
    if (Array.isArray(body.tags)) {
      setTags(db, id, body.tags.map(String));
      updated = getItem(db, id); // 重读一次，保证返回的是含最新标签的完整行
    }
    return NextResponse.json(updated);
  } catch (e) {
    console.error("[knowledge:update]", e);
    return NextResponse.json({ error: "更新知识条目失败" }, { status: 500 });
  }
}

// DELETE /api/knowledge/[id]?purge=true —— 彻底删除（不可恢复的硬删除）
// 不带 purge 时是软删：条目进回收站（kept→trashed），7 天内可捞回。
// 「删除按钮默认可反悔、彻底删除才需要确认」正是桌面废纸篓的心智模型。
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const purge = req.nextUrl.searchParams.get("purge") === "true";
  try {
    const db = getDb();
    if (purge) {
      const ok = deleteItem(db, id); // 标签随外键级联清理
      if (!ok) {
        return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
      }
      return NextResponse.json({ ok: true });
    }
    const trashed = trashItem(db, id);
    if (!trashed) {
      return NextResponse.json(
        { error: "条目不存在或不是保留状态（仅保留过的内容有回收期）" },
        { status: 409 },
      );
    }
    return NextResponse.json(trashed);
  } catch (e) {
    console.error("[knowledge:delete]", e);
    return NextResponse.json({ error: "删除知识条目失败" }, { status: 500 });
  }
}

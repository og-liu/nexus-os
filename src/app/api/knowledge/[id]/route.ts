// 知识条目单条路由（K1 状态流转）。
//
// 对应 store 的单条操作：读一条 / 改字段（含状态流转）/ 删除。
// 拍板动作（保留 kept / 放弃 discarded）就是 PATCH status，
// 前端不发明新动词，状态机只有一份数据层语义。

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  deleteItem,
  getItem,
  setTags,
  updateItem,
  type KnowledgeStatus,
  type UpdateItemPatch,
} from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/knowledge/[id]">;

const STATUSES: readonly string[] = ["inbox", "kept", "discarded", "trashed"];

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
// body: { title?, content?, status?, tags? }
// tags 走全量替换语义（setTags），与「编辑完整集合后提交」的 UI 交互对齐
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体必须是 JSON 对象" }, { status: 400 });
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

// DELETE /api/knowledge/[id] —— 硬删除（回收站/彻底删除的语义在 K1 只到「放弃=discarded」，
// 真正的 7 天软删 + 捞回留给 trash 流，这里先把数据面能力建齐）
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const ok = deleteItem(getDb(), id);
    if (!ok) {
      return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[knowledge:delete]", e);
    return NextResponse.json({ error: "删除知识条目失败" }, { status: 500 });
  }
}

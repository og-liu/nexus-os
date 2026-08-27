// 批量去重接口（阶段4 P2，阶段2 挂起的 UI 现在有了消费方）。
//
// GET  /api/knowledge/duplicates → 全库重复报告（分组：同链接 / 同内容）
// POST /api/knowledge/duplicates → 执行去重（body: { discardIds: string[] }），
//                                  把重复组里人不要的条目批量拍板为 discarded
//
// 去重动作 = discarded（进「不要了」状态）而非物理删除：去重是批量操作，
// 误判空间比单条操作大，必须给反悔留后路（回收站语义兜底）

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { updateItem } from "@/lib/knowledge/store";
import { findDuplicates } from "@/lib/knowledge/dedupe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const groups = findDuplicates(getDb());
  return NextResponse.json({ groups, total: groups.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const discardIds = Array.isArray(body?.discardIds)
    ? body.discardIds.map(String)
    : [];

  if (discardIds.length === 0) {
    return NextResponse.json({ error: "discardIds 不能为空" }, { status: 400 });
  }

  const db = getDb();
  let ok = 0;
  let missing = 0;
  // 逐条拍板而非一条 UPDATE：updateItem 里维护 updated_at 和状态机校验，
  // 绕过它直接改库会留下一堆 updated_at 不变的僵尸行
  for (const id of discardIds) {
    const r = updateItem(db, id, { status: "discarded" });
    if (r) ok++;
    else missing++;
  }
  return NextResponse.json({ ok, missing });
}

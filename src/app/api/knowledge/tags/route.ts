// 全局标签路由（K2 标签筛选与管理）。
//
// 和 [id] 单条路由的区别：这里操作的是「标签」这个维度本身——
// 列出全部标签、全局重命名（所有条目一起改）、全局删除。
// 数据操作全部委托 store，route 只做 HTTP 语义映射。

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { listTags, removeTag, renameTag } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/knowledge/tags —— 全部标签 + 使用计数（降序），驱动标签选择器与筛选入口
export async function GET() {
  try {
    return NextResponse.json({ tags: listTags(getDb()) });
  } catch (e) {
    console.error("[knowledge:tags:list]", e);
    return NextResponse.json({ error: "读取标签失败" }, { status: 500 });
  }
}

// PATCH /api/knowledge/tags —— 全局重命名 body: { from, to }
// 新名已存在时自动合并（store 里 INSERT OR IGNORE 两步走）
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const from = typeof body?.from === "string" ? body.from : "";
  const to = typeof body?.to === "string" ? body.to : "";
  if (!from || !to) {
    return NextResponse.json({ error: "from 与 to 均不能为空" }, { status: 400 });
  }

  try {
    // 改不存在的标签：store 返回 false 时语义上是「无事发生」，也回 200——
    // 幂等友好，前端刷新后自然看到原状
    renameTag(getDb(), from, to);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[knowledge:tags:rename]", e);
    return NextResponse.json({ error: "重命名标签失败" }, { status: 500 });
  }
}

// DELETE /api/knowledge/tags?tag=xxx —— 全局删除标签
export async function DELETE(req: NextRequest) {
  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  if (!tag) {
    return NextResponse.json({ error: "缺少 tag 参数" }, { status: 400 });
  }

  try {
    removeTag(getDb(), tag);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[knowledge:tags:remove]", e);
    return NextResponse.json({ error: "删除标签失败" }, { status: 500 });
  }
}

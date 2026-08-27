// 摘录接口（阶段4 P2·读书划线）。
//
// GET   /api/knowledge/[id]/excerpts      → 这条条目的全部摘录
// POST  /api/knowledge/[id]/excerpts      → 新增摘录（body: { text, note? }）
// DELETE /api/knowledge/[id]/excerpts?excerptId=xxx → 删一条
//
// 挂在条目子路径下的原因：摘录没有独立于条目的使用场景，
// 它的生命周期完全从属于某条知识——条目删了摘录级联消失

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getItem } from "@/lib/knowledge/store";
import { addExcerpt, listExcerpts, removeExcerpt } from "@/lib/knowledge/excerpts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/knowledge/[id]/excerpts">;

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  if (!getItem(db, id)) {
    return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
  }
  return NextResponse.json({ excerpts: listExcerpts(db, id) });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const note = typeof body?.note === "string" ? body.note : undefined;

  const db = getDb();
  if (!getItem(db, id)) {
    return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
  }
  try {
    const result = addExcerpt(db, id, text, note);
    // 摘过了就摘过了：重复存同一句话对用户没有新信息，
    // 静默幂等（返回 200）比报错「已存在」更符合直觉——用户只关心「存住了」
    if ("duplicate" in result) {
      return NextResponse.json({ duplicate: true }, { status: 200 });
    }
    return NextResponse.json({ excerpt: result.row }, { status: 201 });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "未知原因";
    return NextResponse.json({ error: reason }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const excerptId = req.nextUrl.searchParams.get("excerptId");
  if (!excerptId) {
    return NextResponse.json({ error: "缺少 excerptId 参数" }, { status: 400 });
  }
  const db = getDb();
  if (removeExcerpt(db, excerptId)) {
    return NextResponse.json({ ok: true });
  }
  // 条目 id 在路径里但摘录按自己的 id 删——摘录不存在（或已被删）返回 404
  void id;
  return NextResponse.json({ error: "摘录不存在" }, { status: 404 });
}

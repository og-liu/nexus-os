// 降级条目的重试抓取接口（阶段2 P0·失败兜底）。
//
// 为什么是独立路由而不是 PATCH：重抓是「拿既有链接重新执行采集动作」，
// 语义上是一次新的采集而非字段编辑；PATCH 只该改字段。独立动词
// 也让前端调用点一目了然——看到 refetch 就知道这条链路会发网络请求。

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { refetchItem } from "@/lib/knowledge/refetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/knowledge/[id]/refetch">;

// POST /api/knowledge/[id]/refetch —— 重抓一条降级条目的正文
// 成功 200 { item }；条目不存在 404；抓取仍失败 502 { reason }（人话原因，
// 前端直接 toast 给用户，不再包一层「未知错误」）
export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const result = await refetchItem(getDb(), id);
    if (result.ok) {
      return NextResponse.json({ item: result.item });
    }
    // 条目不存在是客户端的错（404）；抓不到正文是上游站点的问题（502）
    const status = result.reason === "条目不存在" ? 404 : 502;
    return NextResponse.json({ error: result.reason }, { status });
  } catch (e) {
    console.error("[knowledge:refetch]", e);
    return NextResponse.json({ error: "重新抓取失败" }, { status: 500 });
  }
}

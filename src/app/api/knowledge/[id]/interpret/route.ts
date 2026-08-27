// 手动解读接口（阶段3 P1·自动解读的兜底入口）。
//
// POST /api/knowledge/[id]/interpret
// 两个消费场景：
// - 详情页「AI 先帮我看看」按钮：没赶上自动解读的条目（RSS 批量条目、
//   自动解读失败、开关关掉了自动触发）在这里手动补
// - 「重新生成」：旧解读不满意（force 路径，覆盖旧结果）
//
// 与 refetch 的分工：refetch 管把正文抓回来，interpret 管读懂它——
// 降级条目得先重试成功有了正文，解读才有材料

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { interpretItem } from "@/lib/knowledge/interpret";
import { getItem } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/knowledge/[id]/interpret">;

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const db = getDb();
  if (!getItem(db, id)) {
    return NextResponse.json({ error: "知识条目不存在" }, { status: 404 });
  }
  try {
    // force=true：手动按钮的语义就是「给我一份新的」，不迁就旧结果
    const item = await interpretItem(db, id, true);
    return NextResponse.json(item);
  } catch (e) {
    // 手动触发要给人话反馈（自动触发那条线是静默的，这里必须说清楚）
    const reason = e instanceof Error ? e.message : "未知原因";
    return NextResponse.json(
      { error: `解读生成失败：${reason}` },
      { status: 502 },
    );
  }
}

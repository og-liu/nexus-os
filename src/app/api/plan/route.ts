import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { updatePlanStatus, PLAN_STATUS } from "@/lib/agent/plan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 放弃一份「已中断」的计划。
 *
 * 断点恢复的「放弃」入口：把该会话的 stopped 计划翻成 cancelled（终态），
 * 让前端历史加载时不再读到「可恢复」计划，从而隐藏「继续 / 放弃」提示。
 * 幂等：若没有未完成的计划（running / paused / stopped），updatePlanStatus 静默跳过。
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    sessionId?: string;
  } | null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
  if (!sessionId) {
    return NextResponse.json({ error: "缺少会话 id" }, { status: 400 });
  }

  const db = getDb();
  updatePlanStatus(db, sessionId, PLAN_STATUS.CANCELLED);
  return NextResponse.json({ ok: true });
}
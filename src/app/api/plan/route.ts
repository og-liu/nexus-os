import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import {
  updatePlanStatus,
  archiveStoppedTurn,
  PLAN_STATUS,
} from "@/lib/agent/plan-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 放弃一份「已中断」的计划（整轮归档）。
 *
 * 断点恢复的「放弃」入口，做两件事：
 *   1) 计划翻成 cancelled（终态）→ 前端历史加载时不再读到「可恢复」计划，
 *      「继续 / 放弃」入口随之隐藏；
 *   2) 消息整轮归档（archiveStoppedTurn）→ user 提问 + stopped 半截回复一起翻
 *      cancelled。若只翻计划、留下孤立的 user 提问，后续对话喂给模型的历史里
 *      会残留一条「没被回应过的旧需求」，新回答仍会被旧任务带偏。
 * 幂等：若没有未完成的计划（running / paused / stopped），两者都静默跳过。
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
  archiveStoppedTurn(db, sessionId);
  return NextResponse.json({ ok: true });
}
// 每日回顾接口（阶段4 P2）：GET /api/knowledge/review
//
// 数据底座是 store.getReviewItems（今日统计 + 20 条最久存库的候选）。
// 随机挑 4 条在这里做而不是 store：挑几条、要不要随机，是展示策略，
// 数据层该稳定（测试才可断言），展示策略随产品感觉调

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getReviewItems } from "@/lib/knowledge/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 每次回顾展示的条数：太少像没做，太多变成第二个待处理队列 */
const REVISIT_COUNT = 4;

export async function GET() {
  const { todayCaptured, todayKept, revisit } = getReviewItems(getDb());

  // Fisher-Yates 洗 20 条候选再取前 4：无偏随机（Math.random 已够，
  // 这不是加密场景），「换一批」重拉就是新组合
  const pool = [...revisit];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  return NextResponse.json({
    todayCaptured,
    todayKept,
    revisit: pool.slice(0, REVISIT_COUNT),
    poolSize: revisit.length,
  });
}

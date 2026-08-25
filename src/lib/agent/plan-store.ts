// 计划的持久化层：把「规划-执行」过程中生成的计划写进 SQLite。
//
// 本次在「打数据地基」（savePlan / getActivePlan）之上，又补上了「暂停-恢复」需要的读取能力
// （getPausedPlan）：执行器遇到补问步骤会暂停并把计划存成 paused 态，route 下一轮靠
// getPausedPlan 判断「该会话是否在等用户回复、要不要走续跑」。数据表结构本身无需变动。
//
// 设计约定：一个 session 同一时刻最多存在一个「活动中的计划」（running / paused），
// 保证 getActivePlan 能稳定取到「当前还没走完的那份计划」；历史上已完成的计划（done /
// failed）保留多条，方便以后审计、回看重播。

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type { Plan, PlanStep } from "./plan";

/** 计划状态常量（与 task_plans.status 列取值对应，集中管理避免散落魔法字符串） */
export const PLAN_STATUS = {
  /** 执行中（规划完、正在逐步执行） */
  RUNNING: "running",
  /** 已完成（所有步骤执行完毕并汇总） */
  DONE: "done",
  /** 已失败 / 终止 */
  FAILED: "failed",
  /** 暂停中（预留给 HITL 人工确认、跨轮恢复） */
  PAUSED: "paused",
} as const;

/** 计划状态的联合类型（从常量对象推导，保证写表读表都走同一套取值） */
export type PlanStatus = (typeof PLAN_STATUS)[keyof typeof PLAN_STATUS];

/** task_plans 表的一行（steps 是 JSON 字符串，读出来需反序列化） */
export interface TaskPlanRow {
  id: string;
  session_id: string;
  goal: string;
  steps: string;
  status: string;
  created_at: number;
  updated_at: number;
}

// 「活动中的计划」的 SQL 元组：被 savePlan / getActivePlan / updatePlanStatus 复用，
// 保证「当前计划」的判定口径一致。用模板拼接是因为 better-sqlite3 不方便对 IN 列表做参数化。
const ACTIVE_STATUSES = `('${PLAN_STATUS.RUNNING}', '${PLAN_STATUS.PAUSED}')`;

/**
 * 保存（或更新）某会话的当前计划。
 *
 * 采用「upsert」策略：若该会话已存在活动计划，就在原记录上更新（保持 planId 稳定，
 * 便于跨轮恢复时始终定位到同一条计划）；否则新建一条。steps 用 JSON 序列化存进 TEXT 列。
 *
 * @param db        SQLite 连接（由 getDb() 提供）
 * @param sessionId 会话 id
 * @param plan      要保存的计划（含 goal 与 steps）
 * @param status    状态（running / done / failed / paused）
 * @returns 计划记录 id（新建或复用）
 */
export function savePlan(
  db: Database.Database,
  sessionId: string,
  plan: Plan,
  status: PlanStatus,
): string {
  const now = Date.now();

  // 先找该会话当前活动计划：有则更新（保持 id 稳定），无则新建
  const existing = db
    .prepare(
      `SELECT id FROM task_plans
       WHERE session_id = ? AND status IN ${ACTIVE_STATUSES}
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(sessionId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE task_plans
       SET goal = ?, steps = ?, status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(plan.goal, JSON.stringify(plan.steps), status, now, existing.id);
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO task_plans (id, session_id, goal, steps, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    sessionId,
    plan.goal,
    JSON.stringify(plan.steps),
    status,
    now,
    now,
  );
  return id;
}

/**
 * 读取某会话「当前活动中的计划」；没有则不返回。
 *
 * @returns Plan（steps 已从 JSON 反序列化）；无活动计划或数据损坏时返回 null
 */
export function getActivePlan(
  db: Database.Database,
  sessionId: string,
): Plan | null {
  const row = db
    .prepare(
      `SELECT * FROM task_plans
       WHERE session_id = ? AND status IN ${ACTIVE_STATUSES}
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(sessionId) as TaskPlanRow | undefined;

  if (!row) return null;

  // steps 存的是 JSON 字符串，读回来可能损坏，损坏时按「无计划」处理
  try {
    const steps = JSON.parse(row.steps) as PlanStep[];
    if (!Array.isArray(steps)) return null;
    return { goal: row.goal ?? "", steps };
  } catch {
    return null;
  }
}

/**
 * 读取某会话「暂停中」的计划（HITL 补问后等待用户回复），带步骤进度。
 *
 * 为什么需要单独一个函数，而不是复用 getActivePlan：
 *   - getActivePlan 的语义是「当前还没走完的那份活动计划」，running / paused 都算；
 *   - 而 route 在每轮请求开始时，需要**精确判断**「用户这轮是不是回来回答补问的」——
 *     只有 paused 状态才代表「在等用户输入、该走续跑」，running 代表「上一轮还在正常执行」。
 *   两者判定口径不同，混用会让「正常执行中」的会话被误当成「待续跑」。
 *
 * @returns 含步骤 status/result 的计划（steps 已反序列化）；该会话没有 paused 计划或数据损坏时返回 null
 */
export function getPausedPlan(
  db: Database.Database,
  sessionId: string,
): Plan | null {
  const row = db
    .prepare(
      `SELECT * FROM task_plans
       WHERE session_id = ? AND status = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(sessionId, PLAN_STATUS.PAUSED) as TaskPlanRow | undefined;

  if (!row) return null;

  // steps 存的是 JSON 字符串，读回来可能损坏，损坏时按「没有可续跑的计划」处理
  try {
    const steps = JSON.parse(row.steps) as PlanStep[];
    if (!Array.isArray(steps)) return null;
    return { goal: row.goal ?? "", steps };
  } catch {
    return null;
  }
}

/**
 * 更新某会话当前活动计划的状态。
 *
 * 典型用法：执行到 plan_done 时把状态从 running 翻成 done。
 * 若该会话没有活动计划，静默跳过（幂等，不抛错）。
 */
export function updatePlanStatus(
  db: Database.Database,
  sessionId: string,
  status: PlanStatus,
): void {
  const now = Date.now();
  db.prepare(
    `UPDATE task_plans
     SET status = ?, updated_at = ?
     WHERE session_id = ? AND status IN ${ACTIVE_STATUSES}`,
  ).run(status, now, sessionId);
}
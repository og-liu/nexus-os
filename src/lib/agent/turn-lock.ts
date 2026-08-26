// 会话级「本轮执行中」内存锁 + 崩溃残留自愈。
//
// ── 为什么需要锁（服务端并发防护）─────────────────────────────
// 同一个会话若同时跑两轮 agentLoop（双开窗口各发一条、手快连点两次发送、
// 旧请求还没断新请求又进来），两边会对同一张 messages / task_plans 表交叉写：
// 占位消息出现两条 running、计划状态互相覆盖、SSE 事件串台。SQLite 的单写者
// 模型保证库文件不会写坏，但业务数据一定会脏。所以服务端必须有一道闸：
// 同一会话同一时刻只放行一轮。
//
// ── 为什么用进程内存 Set，而不是查 DB 的 running 状态来判断────
// DB 里的 running 有两种来源：「真在跑」和「崩溃残留」（见下），光看数据库
// 无法区分这两种含义；而进程内存里的锁集合天然精确——进程重启即清空，
// 谁持有锁一目了然。它同时是下面自愈逻辑的判据，一份数据解决两个问题。
//
// 局限说明：Set 只在单进程内有效。本项目是个人本地单人应用，Next.js 单进程
// 运行，够用；将来若多实例部署，需换成 Redis 之类的跨进程方案。

import type Database from "better-sqlite3";
import { PLAN_STATUS } from "./plan-store";

/** 正在执行中的会话 id 集合（模块级单例，同进程所有请求共享） */
const activeTurns = new Set<string>();

/**
 * 尝试占用某会话的执行权。
 * 占用成功返回 true；已被占用返回 false（调用方应直接拒绝本次请求）。
 */
export function tryLockTurn(sessionId: string): boolean {
  if (activeTurns.has(sessionId)) return false;
  activeTurns.add(sessionId);
  return true;
}

/**
 * 释放会话执行权。
 * 无论本轮正常完成、报错还是中断都必须调用（放在流式收尾的两个出口处），
 * 否则锁泄漏会导致该会话从此再也发不出消息。
 */
export function unlockTurn(sessionId: string): void {
  activeTurns.delete(sessionId);
}

/** 该会话当前是否真的有一轮在本进程中执行。 */
export function isTurnActive(sessionId: string): boolean {
  return activeTurns.has(sessionId);
}

/**
 * 崩溃残留自愈：把「孤儿 running」数据修正为 stopped。
 *
 * 背景：agentLoop 执行期间，计划是 running、assistant 占位消息也是 running；
 * 二者的终态化都依赖本轮这条流式请求自己走完 catch / 收尾逻辑。一旦进程中途
 * 被杀（dev 重启、Ctrl+C、断电），没有任何代码有机会把它们翻成终态——重启后
 * 库里就永远躺着一个假的 running：
 *   - 计划卡 running → getRecoverablePlan 返回 running，前端渲染出「继续/放弃」，
 *     但点继续会被 resume 校验拒绝（校验只认 stopped）→ 死锁：既续不了跑，
 *     也走不到「换话题自动归档」的链路（归档条件同样只认 stopped）；
 *   - assistant 占位消息卡 running → 前端永远显示「生成中」假死气泡；而历史
 *     查询又排除 running 状态，成了一条看不见却真实存在的僵尸行。
 *
 * 判据：本进程的锁集合里没有这个会话 = 本进程此刻没有任何轮次在跑。
 * 此时 DB 里若还存在 running，必然来自上一个已经死掉的进程，可放心翻成
 * stopped——stopped 是「已中断」语义：计划走断点恢复链路（继续/放弃）、
 * 消息走整轮归档链路（archiveStoppedTurn），都能正确接管这些残留数据。
 *
 * 调用时机：chat POST 入口、会话详情 GET 入口，都在读取计划/消息之前执行，
 * 这样后续读到的永远是自愈后的干净状态，下游分支逻辑无需感知残留的存在。
 */
export function healOrphanRunningState(
  db: Database.Database,
  sessionId: string,
): void {
  // 本进程正在这个会话上跑轮次：running 是活的，绝不能碰
  if (isTurnActive(sessionId)) return;

  // 孤儿 running 计划 → stopped（此后 getRecoverablePlan 能读到它，
  // resume 校验与「换话题归档」两条链路都能正常接管）
  db.prepare(
    `UPDATE task_plans SET status = ?, updated_at = ?
     WHERE session_id = ? AND status = ?`,
  ).run(PLAN_STATUS.STOPPED, Date.now(), sessionId, PLAN_STATUS.RUNNING);

  // 孤儿 running 占位消息 → stopped（半截内容保留；前端从假死的「生成中」
  // 变为「已中断」，且成为归档链路可识别的状态）
  db.prepare(
    `UPDATE messages SET status = ?
     WHERE session_id = ? AND role = 'assistant' AND status = ?`,
  ).run(PLAN_STATUS.STOPPED, sessionId, "running");
}

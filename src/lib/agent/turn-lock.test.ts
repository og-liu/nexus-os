import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db";
import {
  tryLockTurn,
  unlockTurn,
  isTurnActive,
  healOrphanRunningState,
} from "./turn-lock";
import { savePlan, getRecoverablePlan, PLAN_STATUS } from "./plan-store";
import type { Plan } from "./plan";

/**
 * turn-lock 单测：覆盖「崩溃残留自愈」与「同会话并发防护」两个修复点。
 *
 * 核心场景：进程被杀后 DB 里残留的 running 计划 / running 占位消息，
 * 必须在下次读取前被翻成 stopped（走断点恢复/归档链路），且绝不许
 * 误伤本进程正在执行中的真 running 数据。
 */
describe("turn-lock（并发锁 + 崩溃残留自愈）", () => {
  let db: Database.Database;
  const sid = "s1";

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    db.prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(sid, "新会话", 1000, 1000);
    // 测试之间清空锁集合，避免用例互相污染
    unlockTurn(sid);
  });

  // 测试辅助：插一条消息
  const insertMsg = (
    id: string,
    role: "user" | "assistant",
    status: string | null,
    t: number,
    content = "",
  ) => {
    db.prepare(
      `INSERT INTO messages (id, session_id, role, content, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, sid, role, content, status, t);
  };

  // 测试辅助：读某条消息的状态
  const msgStatus = (id: string): string | null =>
    (
      db
        .prepare(`SELECT status FROM messages WHERE id = ?`)
        .get(id) as { status: string | null }
    )?.status ?? null;

  it("锁互斥：同一会话第二个请求抢不到锁，释放后可重新抢占", () => {
    expect(tryLockTurn(sid)).toBe(true);
    expect(isTurnActive(sid)).toBe(true);
    // 双开窗口 / 连点发送：第二个请求必须被拒
    expect(tryLockTurn(sid)).toBe(false);
    unlockTurn(sid);
    // 收尾释放后放行下一轮
    expect(tryLockTurn(sid)).toBe(true);
    unlockTurn(sid);
  });

  it("不同会话互不干扰：A 会话持锁不影响 B 会话", () => {
    expect(tryLockTurn("s1")).toBe(true);
    expect(tryLockTurn("s2")).toBe(true);
    unlockTurn("s1");
    expect(isTurnActive("s1")).toBe(false);
    expect(isTurnActive("s2")).toBe(true);
    unlockTurn("s2");
  });

  it("自愈：孤儿 running 计划和占位消息都翻成 stopped", () => {
    const plan: Plan = { goal: "调研PHP", steps: [] };
    savePlan(db, sid, plan, PLAN_STATUS.RUNNING); // 模拟崩溃时卡住的计划
    insertMsg("u1", "user", null, 1001, "帮我调研PHP");
    insertMsg("a1", "assistant", "running", 1001, "好的，我先…"); // 崩溃时卡住的占位行
    insertMsg("a0", "assistant", "done", 1000, "上一轮完整回复");

    healOrphanRunningState(db, sid);

    // 计划变 stopped → getRecoverablePlan 能读到，resume 校验可通过
    expect(getRecoverablePlan(db, sid)?.status).toBe("stopped");
    // 占位行变 stopped → 前端显示「已中断」，归档链路可接管
    expect(msgStatus("a1")).toBe("stopped");
    // 其他状态的数据纹丝不动
    expect(msgStatus("a0")).toBe("done");
    expect(msgStatus("u1")).toBeNull();
  });

  it("自愈不碰终态数据：done/paused/cancelled 一律保持原状", () => {
    insertMsg("a-done", "assistant", "done", 1000, "完整回复");
    insertMsg("a-cancelled", "assistant", "cancelled", 1001, "已放弃");
    savePlan(db, sid, { goal: "g", steps: [] }, PLAN_STATUS.PAUSED); // 补问等待中

    healOrphanRunningState(db, sid);

    expect(msgStatus("a-done")).toBe("done");
    expect(msgStatus("a-cancelled")).toBe("cancelled");
    // paused 是 HITL 补问语义，不是残留，绝不能被翻成 stopped
    expect(getRecoverablePlan(db, sid)).toBeNull();
    const row = db
      .prepare(`SELECT status FROM task_plans WHERE session_id = ?`)
      .get(sid) as { status: string };
    expect(row.status).toBe("paused");
  });

  it("本进程正在跑时不自愈：活 running 数据毫发无损", () => {
    savePlan(db, sid, { goal: "g", steps: [] }, PLAN_STATUS.RUNNING);
    insertMsg("a-live", "assistant", "running", 1002, "正在生成…");

    tryLockTurn(sid); // 模拟本轮真的在执行
    healOrphanRunningState(db, sid);

    // 判据生效：有活跃轮次时 running 是活的，不能动
    expect(getRecoverablePlan(db, sid)?.status).toBe("running");
    expect(msgStatus("a-live")).toBe("running");
    unlockTurn(sid);

    // 本轮结束后再调（比如下一轮请求进来），若数据还在才按残留处理
    healOrphanRunningState(db, sid);
    expect(getRecoverablePlan(db, sid)?.status).toBe("stopped");
    expect(msgStatus("a-live")).toBe("stopped");
  });
});

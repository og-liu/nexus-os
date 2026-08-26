import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { initSchema } from "@/lib/db";
import {
  archiveStoppedTurn,
  PLAN_STATUS,
  savePlan,
  updatePlanStatus,
  getRecoverablePlan,
} from "./plan-store";
import type { Plan } from "./plan";

/**
 * archiveStoppedTurn 单测：覆盖「停止→续跑→换话题」这条这几天反复出 bug 的链路。
 *
 * 核心原则：一次对话 = user 提问 + assistant 回答，归档必须整轮收尾，
 * 不能留下孤立的 user 提问污染模型上下文（那会导致「第二轮答第一轮的问题」）。
 */
describe("archiveStoppedTurn（整轮配对归档）", () => {
  let db: Database.Database;
  const sid = "s1";
  const ts = (n: number) => 1_000 + n; // 用递增时间戳保证消息顺序确定

  // 建一个内存库并铺好会话；每条用例前重置，互不干扰
  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    db.prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(sid, "新会话", ts(0), ts(0));
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

  it("把「提问 + 半截回复」整轮翻成 cancelled", () => {
    // 场景：发了个任务 → 中途停止（assistant 停在半截）→ 换话题触发归档
    insertMsg("u-old", "user", null, ts(1), "帮我调研PHP");
    insertMsg("a-stop", "assistant", "stopped", ts(2), "我来帮你调研");

    archiveStoppedTurn(db, sid);

    const rows = db
      .prepare(`SELECT id, status FROM messages ORDER BY created_at`)
      .all() as Array<{ id: string; status: string | null }>;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));

    // 两条都该被归档：提问和半截回复是配对的整体
    expect(byId["u-old"]).toBe("cancelled");
    expect(byId["a-stop"]).toBe("cancelled");
  });

  it("覆盖「停止→继续执行→又停止」整条链：所有半截都收，只收源头提问", () => {
    // 场景（这几天的真实操作）：停止一次 → 点继续执行 → 又停止 → 再继续 → 再停止
    // 中间续跑产生的是 assistant 占位（无新 user 消息），库里会有多条 stopped assistant。
    // 归档应收掉所有 stopped assistant，但 user 提问只有最源头那一条要翻 cancelled。
    insertMsg("u-old", "user", null, ts(1), "帮我调研PHP");
    insertMsg("a-stop1", "assistant", "stopped", ts(2));
    insertMsg("a-stop2", "assistant", "stopped", ts(4));
    insertMsg("a-stop3", "assistant", "stopped", ts(6));

    archiveStoppedTurn(db, sid);

    const rows = db
      .prepare(`SELECT id, role, status FROM messages ORDER BY created_at`)
      .all() as Array<{ id: string; role: string; status: string | null }>;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));

    expect(byId["u-old"]).toBe("cancelled");
    expect(byId["a-stop1"]).toBe("cancelled");
    expect(byId["a-stop2"]).toBe("cancelled");
    expect(byId["a-stop3"]).toBe("cancelled");

    // 不应出现「多条 user 被标 cancelled」（只收源头那一条提问）
    const cancelledUsers = rows.filter(
      (r) => r.role === "user" && r.status === "cancelled",
    );
    expect(cancelledUsers).toHaveLength(1);
  });

  it("幂等：没有 stopped 消息时什么都不改", () => {
    insertMsg("u1", "user", null, ts(1), "你好");
    insertMsg("a1", "assistant", "done", ts(2), "你好！");

    archiveStoppedTurn(db, sid);

    const rows = db
      .prepare(`SELECT id, status FROM messages ORDER BY created_at`)
      .all() as Array<{ id: string; status: string | null }>;
    // done 的 assistant 和正常 user 都不应被动
    expect(rows.find((r) => r.id === "u1")?.status).toBeNull();
    expect(rows.find((r) => r.id === "a1")?.status).toBe("done");
  });

  it("不误伤已完成的历史对话：只归档当前这轮 stopped", () => {
    // 场景：上一轮正常完成（user + done assistant），这一轮 stopped
    insertMsg("u-prev", "user", null, ts(1), "今天天气");
    insertMsg("a-prev", "assistant", "done", ts(2), "晴天");
    insertMsg("u-cur", "user", null, ts(3), "帮我调研PHP");
    insertMsg("a-cur", "assistant", "stopped", ts(4));

    archiveStoppedTurn(db, sid);

    const rows = db
      .prepare(`SELECT id, status FROM messages ORDER BY created_at`)
      .all() as Array<{ id: string; status: string | null }>;
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));

    // 上一轮完整对话保持原样，不被这轮归档波及
    expect(byId["u-prev"]).toBeNull();
    expect(byId["a-prev"]).toBe("done");
    // 这一轮整轮归档
    expect(byId["u-cur"]).toBe("cancelled");
    expect(byId["a-cur"]).toBe("cancelled");
  });

  it("failed 的 assistant 不被当作 stopped 归档（它是完整的出错回答）", () => {
    insertMsg("u1", "user", null, ts(1), "你好");
    insertMsg("a-fail", "assistant", "failed", ts(2), "调用失败");

    archiveStoppedTurn(db, sid);

    const row = db
      .prepare(`SELECT status FROM messages WHERE id = ?`)
      .get("a-fail") as { status: string };
    expect(row.status).toBe("failed");
  });
});

// ── 计划状态流转：覆盖「停止→继续」翻 running、「放弃」翻 cancelled ──
describe("updatePlanStatus（计划状态流转）", () => {
  let db: Database.Database;
  const sid = "s1";
  const plan: Plan = { goal: "调研PHP", steps: [] };

  beforeEach(() => {
    db = new Database(":memory:");
    initSchema(db);
    db.prepare(
      `INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(sid, "新会话", 1000, 1000);
  });

  it("停止后点「继续」：stopped 计划能翻回 running，且仍可被 getRecoverablePlan 读到", () => {
    savePlan(db, sid, plan, PLAN_STATUS.RUNNING);
    updatePlanStatus(db, sid, PLAN_STATUS.STOPPED); // 用户点停止
    expect(getRecoverablePlan(db, sid)?.status).toBe("stopped");

    updatePlanStatus(db, sid, PLAN_STATUS.RUNNING); // 点继续执行
    expect(getRecoverablePlan(db, sid)?.status).toBe("running");
  });

  it("点「放弃」：stopped 计划翻成 cancelled 后，getRecoverablePlan 读不到", () => {
    savePlan(db, sid, plan, PLAN_STATUS.RUNNING);
    updatePlanStatus(db, sid, PLAN_STATUS.STOPPED);
    updatePlanStatus(db, sid, PLAN_STATUS.CANCELLED); // 点放弃

    expect(getRecoverablePlan(db, sid)).toBeNull();
  });
});

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export interface SessionRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

/**
 * 消息的「生命周期状态」，用于支撑「真停止 / 刷新保留 / 断点恢复」。
 *
 * - user 消息本身没有状态（用户说出去就是终态），落库时 status 存 NULL；
 * - assistant 消息则贯穿一条生命周期：
 *     running —— 生成中（占位一行，边跑边更新，刷新页面能读回半截）
 *     done    —— 正常生成完
 *     stopped —— 用户主动点停止 / 刷新断连，保留已产出的半截内容
 *     failed  —— 模型报错 / 工具失败，本轮没有产出该消息
 * 集中在这里定义类型，route 落库时取同一套字面量，避免魔法字符串散落。
 */
export type MessageStatus = "running" | "done" | "stopped" | "failed";

export interface MessageRow {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  images: string | null;
  tool_calls: string | null;
  reasoning: string | null;
  usage: string | null;
  /** 消息状态：user 消息为 NULL；assistant 消息见 MessageStatus 说明 */
  status: string | null;
  created_at: number;
}

// 数据库文件放在项目根目录 data/ 下，随 .gitignore 一并忽略，不进 Git
const dbPath = path.join(process.cwd(), "data", "nexus.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新会话',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      images TEXT,
      tool_calls TEXT,
      reasoning TEXT,
      usage TEXT,
      status TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session
      ON messages (session_id, created_at);

    -- 任务计划表：规划（Plan-and-Execute）模式下，把拆解出的计划持久化，
    -- 为后续「人工确认(HITL)」和「跨轮恢复」打数据地基。steps 存 JSON 字符串。
    CREATE TABLE IF NOT EXISTS task_plans (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      goal TEXT,
      steps TEXT,
      status TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_plans_session
      ON task_plans (session_id, created_at);
  `);

  // 迁移：给已存在的旧库 messages 表补 tool_calls / reasoning / usage 列（工具调用、思考过程、token 用量持久化）
  // CREATE TABLE IF NOT EXISTS 不会给已有表加分，这里用 PRAGMA 检测后 ALTER 补列，幂等安全
  const cols = db.prepare(`PRAGMA table_info(messages)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "tool_calls")) {
    db.exec(`ALTER TABLE messages ADD COLUMN tool_calls TEXT`);
  }
  if (!cols.some((c) => c.name === "reasoning")) {
    db.exec(`ALTER TABLE messages ADD COLUMN reasoning TEXT`);
  }
  if (!cols.some((c) => c.name === "usage")) {
    db.exec(`ALTER TABLE messages ADD COLUMN usage TEXT`);
  }
  if (!cols.some((c) => c.name === "status")) {
    db.exec(`ALTER TABLE messages ADD COLUMN status TEXT`);
  }

  return db;
}
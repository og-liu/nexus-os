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
 *     running   —— 生成中（占位一行，边跑边更新，刷新页面能读回半截）
 *     done      —— 正常生成完
 *     stopped   —— 用户主动点停止 / 刷新断连，保留已产出的半截内容（「继续/放弃」入口由此判断）
 *     failed    —— 模型报错 / 工具失败，本轮没有产出该消息
 *     cancelled —— 该消息对应的任务被后续新消息取代、已归档，不再可恢复（区别于 stopped）
 * 集中在这里定义类型，route 落库时取同一套字面量，避免魔法字符串散落。
 */
export type MessageStatus =
  | "running"
  | "done"
  | "stopped"
  | "failed"
  | "cancelled";

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

/**
 * 在给定连接上建表 + 跑迁移。抽出来是为了让生产库（文件）和测试库（内存）
 * 共用同一份 schema 定义，避免两边结构漂移。幂等，可重复调用。
 */
export function initSchema(conn: Database.Database): void {
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.exec(`
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

    -- ── 知识库模块（产品主阵地）─────────────────────────────────
    -- 知识条目主表。已定决策（2026-08-26）：内容格式 = Markdown 存 TEXT 列——
    -- 存储保持纯文本「单一事实源」，渲染交给前端解析，避免富文本 HTML 把格式焊死在库里；
    -- 组织方式 = 标签起步（见下方关联表），双链 [[wiki]] 后置到迭代二。
    --
    -- status 是知识条目的生命周期（对应产品原型「待你拍板 → 知识流」的采集流）：
    --   inbox     —— 已采集、待人工拍板（采集页底部的红点列表）
    --   kept      —— 已保留，进入知识流（产品的主内容面）
    --   discarded —— 拍板时放弃（左滑），保留记录但不再出现在默认视图
    --   trashed   —— kept 之后被删除，进回收站（可恢复，与 discarded 的区别是「曾经保留过」）
    --
    -- kind 是条目的出身（K3 前置设计决策：共用一张表 + 身份字段，而非分表）：
    --   captured —— 从外部采集来的内容（手动粘贴 / 未来 RSS 订阅源），走 inbox 拍板流
    --   note     —— 用户自己写的文章，创建即保留（没有拍板概念），不出现在知识流列表
    -- 共表的收益：搜索/标签/回收站/AI 检索只维护一套设施，Agent 工具将来只查一处；
    -- 代价是查询必须带 kind 条件防串味，由 route 层固定传入。
    -- deleted_at：进入回收站的时间戳（仅 trashed 状态有值），7 天懒清理的依据
    CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      source TEXT,
      source_url TEXT,
      status TEXT NOT NULL DEFAULT 'inbox',
      kind TEXT NOT NULL DEFAULT 'captured',
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- 标签关联表：多对多（一条知识多个标签，一个标签挂多条知识）。
    -- 为什么用独立关联表而不是 JSON 数组列：标签筛选是高频查询，
    -- 关联表能走索引精确匹配，JSON 列只能全表扫；复合主键天然防重。
    CREATE TABLE IF NOT EXISTS knowledge_item_tags (
      item_id TEXT NOT NULL,
      tag TEXT NOT NULL,
      PRIMARY KEY (item_id, tag),
      FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_knowledge_items_status
      ON knowledge_items (status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_knowledge_tags_tag
      ON knowledge_item_tags (tag);
  `);

  // 迁移：给已存在的旧库 messages 表补 tool_calls / reasoning / usage / status 列
  // CREATE TABLE IF NOT EXISTS 不会给已有表加分，这里用 PRAGMA 检测后 ALTER 补列，幂等安全
  const cols = conn.prepare(`PRAGMA table_info(messages)`).all() as Array<{
    name: string;
  }>;
  if (!cols.some((c) => c.name === "tool_calls")) {
    conn.exec(`ALTER TABLE messages ADD COLUMN tool_calls TEXT`);
  }
  if (!cols.some((c) => c.name === "reasoning")) {
    conn.exec(`ALTER TABLE messages ADD COLUMN reasoning TEXT`);
  }
  if (!cols.some((c) => c.name === "usage")) {
    conn.exec(`ALTER TABLE messages ADD COLUMN usage TEXT`);
  }
  if (!cols.some((c) => c.name === "status")) {
    conn.exec(`ALTER TABLE messages ADD COLUMN status TEXT`);
  }

  // 迁移：knowledge_items 补 kind（条目出身）与 deleted_at（回收站时间戳）两列
  // 老库已有数据全部默认 kind='captured'——它们本来就是采集来的，语义天然吻合；
  // 新装的库走上面 CREATE TABLE 已带全字段，这里的 ALTER 检测是幂等的，重复执行无副作用
  const itemCols = conn.prepare(`PRAGMA table_info(knowledge_items)`).all() as Array<{
    name: string;
  }>;
  if (!itemCols.some((c) => c.name === "kind")) {
    conn.exec(
      `ALTER TABLE knowledge_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'captured'`,
    );
  }
  if (!itemCols.some((c) => c.name === "deleted_at")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN deleted_at INTEGER`);
  }
}

/**
 * 创建一个纯内存 SQLite 连接并初始化好 schema，专供单元测试使用。
 * 测试跑完连接即回收，不碰磁盘上的真实 data/nexus.db。
 */
export function createInMemoryDb(): Database.Database {
  const conn = new Database(":memory:");
  initSchema(conn);
  return conn;
}

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  initSchema(db);

  return db;
}
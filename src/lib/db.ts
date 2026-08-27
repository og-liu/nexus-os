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

    -- ── 知识流模块（产品主阵地）─────────────────────────────────
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
      -- K4 向量检索：语义指纹（归一化后的 Float32 二进制）与算指纹用的模型名。
      -- 存模型名的原因：将来换嵌入模型时，旧向量和新向量不在同一个空间里，
      -- 不能混着比——靠这一列识别哪些条目需要重算
      embedding BLOB,
      embedding_model TEXT,
      -- 阶段2 P0·永久快照：抓取成功时存一份剥净的正文 HTML（阅读排版用）。
      -- 与 content 分工：content 是给 AI 检索/拍板判断的纯文本（单一事实源），
      -- snapshot_html 只服务「人的阅读体验」（保留链接、图片、结构）；
      -- 原文 404 后本地仍可读，知识流不做「链接坟场」
      snapshot_html TEXT,
      -- 阶段2 P0·重复检测：标题+正文的 SimHash 64 位指纹（16 位 hex）。
      -- 为什么不存向量算余弦：查重要的是「是否高度相似」的二值判断，
      -- SimHash 汉明距离 ≤3 的近似判断足够，且纯位运算不需要嵌入 API
      simhash TEXT,
      -- 阶段2 P0·失败兜底：1 = 当初只按链接降级落库（没抓到正文），可重试。
      -- 重试成功后清零。为什么不用 title 文案约定判断：靠文案模式匹配是隐式契约，
      -- 改一版文案识别就漏了，显式标记才可靠
      degraded INTEGER NOT NULL DEFAULT 0,
      -- 阶段3 P1·自动解读：AI 生成的一页纸导读（摘要 + 关键问题 + 候选标签）。
      -- 为什么存列而不每次现算：解读是「读一次、看多次」的资产，每次打开
      -- 详情重调一次 LLM 是纯烧钱；ai_interpreted_at 记生成时间，既当
      -- 「已生成」判断（防重复跑），也能让 UI 展示导读的新鲜度
      ai_summary TEXT,
      -- 关键问题与候选标签：SQLite 没有原生数组类型，存 JSON 数组字符串，
      -- 应用层读写时序列化/反序列化
      ai_questions TEXT,
      ai_tags TEXT,
      ai_interpreted_at INTEGER,
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
    -- RSS 抓取每篇文章入库前都要按 source_url 查重（feeds/store.ts），
    -- 没索引就是每次全表扫描；IF NOT EXISTS 天然幂等，老库启动即自动补建
    CREATE INDEX IF NOT EXISTS idx_knowledge_items_source_url
      ON knowledge_items (source_url);
    CREATE INDEX IF NOT EXISTS idx_knowledge_tags_tag
      ON knowledge_item_tags (tag);

    -- RSS 订阅源表（K5 自动化采集）：记录「从哪抓」。
    -- url 加 UNIQUE：同一个订阅源添加两次没有意义，数据库层直接拦住；
    -- 文章级去重不在这里做（feeds/store.ts 里按 source_url 应用层查重，
    -- 比唯一约束宽容——手动采集可能合法地存过重复链接）。
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      last_fetched_at INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL
    );

    -- 阶段4 P2·摘录表：读书时划的线。一条知识条目可以摘多段。
    -- 为什么独立表而不是塞进主表 JSON 列：摘录是逐条增删的（读完删一条、
    -- 想起来补一条），JSON 列每次都要整串读出改完整串写回，并发和原子性
    -- 都是坑；独立表增删行天然原子。ON DELETE CASCADE：条目没了摘录
    -- 留着没有意义（孤儿摘录连标题都对不上）
    CREATE TABLE IF NOT EXISTS knowledge_excerpts (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      text TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (item_id) REFERENCES knowledge_items(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_excerpts_item
      ON knowledge_excerpts (item_id, created_at);

    -- 阶段4 P2·自动归档规则表：「满足什么条件就自动打什么标签」。
    -- 语义边界（项目铁律）：规则只打标签，不替人拍板留弃——打标是
    -- 整理（可逆、无信息损失），拍板是决策（丢弃有反悔成本）。
    -- type='domain'：链接域名匹配（如 github.com 的都打「开源」）；
    -- type='keyword'：标题或正文含关键词。enabled 支持临时停用不删规则
    CREATE TABLE IF NOT EXISTS knowledge_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('domain', 'keyword')),
      pattern TEXT NOT NULL,
      tag TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_rules_enabled
      ON knowledge_rules (enabled);
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
  if (!itemCols.some((c) => c.name === "embedding")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN embedding BLOB`);
  }
  if (!itemCols.some((c) => c.name === "embedding_model")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN embedding_model TEXT`);
  }
  // 迁移：知识模块阶段 2（P0）补三列——HTML 快照 / 相似指纹 / 降级标记。
  // 新装的库走上面 CREATE TABLE 已带全字段，这里的 ALTER 检测是幂等的，重复执行无副作用
  if (!itemCols.some((c) => c.name === "snapshot_html")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN snapshot_html TEXT`);
  }
  if (!itemCols.some((c) => c.name === "simhash")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN simhash TEXT`);
  }
  if (!itemCols.some((c) => c.name === "degraded")) {
    conn.exec(
      `ALTER TABLE knowledge_items ADD COLUMN degraded INTEGER NOT NULL DEFAULT 0`,
    );
  }
  // 阶段3 P1·自动解读的 4 列（同款 PRAGMA 检测，幂等迁移）
  if (!itemCols.some((c) => c.name === "ai_summary")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN ai_summary TEXT`);
  }
  if (!itemCols.some((c) => c.name === "ai_questions")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN ai_questions TEXT`);
  }
  if (!itemCols.some((c) => c.name === "ai_tags")) {
    conn.exec(`ALTER TABLE knowledge_items ADD COLUMN ai_tags TEXT`);
  }
  if (!itemCols.some((c) => c.name === "ai_interpreted_at")) {
    conn.exec(
      `ALTER TABLE knowledge_items ADD COLUMN ai_interpreted_at INTEGER`,
    );
  }

  // ── 阶段3 P1·全文搜索：FTS5 虚拟表 ──────────────────────────────
  // external content 模式：索引表只存倒排索引，正文仍住在 knowledge_items，
  // 不把几十 KB 的 content 复制一份占磁盘。
  // 分词器选 trigram 而不是默认 unicode61：unicode61 把连续中文当成一整个
  // token，搜索「机器学习」匹配不到「机器学习入门」这种正文（整词才相等）；
  // trigram 按 3 字符滑窗切，中文子串搜索天然成立（英文同样受益）。
  // 代价：查询串必须 ≥3 字符，两字词（如「笔记」）回落 LIKE 兜底。
  // 同步机制：三个触发器把 knowledge_items 的增删改实时映射进索引，
  // 启动时 rebuild 一次全量重建兜底——触发器万一漏（历史数据、异常路径），
  // 下次启动自愈。个人库几千条 rebuild 是毫秒级，不值得为它做增量标记
  conn.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      title, content,
      tokenize = 'trigram',
      content = 'knowledge_items',
      content_rowid = 'rowid'
    );
    CREATE TRIGGER IF NOT EXISTS knowledge_fts_ai
      AFTER INSERT ON knowledge_items BEGIN
      INSERT INTO knowledge_fts(rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_fts_ad
      AFTER DELETE ON knowledge_items BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content)
        VALUES ('delete', old.rowid, old.title, old.content);
    END;
    CREATE TRIGGER IF NOT EXISTS knowledge_fts_au
      AFTER UPDATE OF title, content ON knowledge_items BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content)
        VALUES ('delete', old.rowid, old.title, old.content);
      INSERT INTO knowledge_fts(rowid, title, content)
        VALUES (new.rowid, new.title, new.content);
    END;
    INSERT INTO knowledge_fts(knowledge_fts) VALUES ('rebuild');
  `);
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
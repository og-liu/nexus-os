import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/** better-sqlite3 的连接对象。所有数据访问函数都接收它，便于测试传入内存库。 */
export type Db = Database.Database;

/**
 * 建表语句。**生产库（文件）与测试库（:memory:）共用这一份定义**——
 * 两处各写一份迟早会漂移，测试就会在「结构其实不同」的库上通过。
 *
 * 全部 `CREATE ... IF NOT EXISTS`，可重复执行。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,          -- 展示用，保留用户输入的大小写
  username_key  TEXT    NOT NULL UNIQUE,   -- 归一化（小写）后的唯一键
  password_hash TEXT    NOT NULL,          -- 自描述格式，见 password.ts
  created_at    INTEGER NOT NULL           -- 毫秒时间戳
);

CREATE TABLE IF NOT EXISTS sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,      -- sha256(cookie 中的原文)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`;

/** 建表（幂等）。单独导出，测试可以在任意连接上初始化结构。 */
export function initSchema(conn: Db): void {
  conn.exec(SCHEMA);
}

/** 在指定文件（或 ":memory:"）上开一个配置好 pragma 的连接，并保证表结构存在。 */
export function createConnection(file: string): Db {
  const conn = new Database(file);
  // WAL：读写不互斥，读请求不会卡住写请求
  conn.pragma("journal_mode = WAL");
  // SQLite 默认**关闭**外键约束，不打开则 sessions 的 ON DELETE CASCADE 形同虚设
  conn.pragma("foreign_keys = ON");
  initSchema(conn);
  return conn;
}

/**
 * 数据库文件的路径。
 *
 * **不能用相对路径推导**：生产是 `output: "standalone"`，进程的工作目录是发布目录，
 * 不是项目根目录，同一个相对路径在两处的落点完全不同。所以线上由环境变量指定绝对路径。
 */
export function resolveDatabasePath(): string {
  return (
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "nexus-os.db")
  );
}

/**
 * 进程内复用的连接。
 *
 * 挂在 `globalThis` 上而不是模块变量上：开发模式热更新会重新执行模块，
 * 模块变量会被新建，而 `globalThis` 不会——否则每次改代码都新开一个连接、句柄泄漏。
 */
const globalForDb = globalThis as unknown as { __nexusOsDb?: Db };

export function getDb(): Db {
  if (!globalForDb.__nexusOsDb) {
    const file = resolveDatabasePath();
    if (file !== ":memory:") {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    }
    globalForDb.__nexusOsDb = createConnection(file);
  }
  return globalForDb.__nexusOsDb;
}

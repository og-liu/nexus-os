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
/**
 * `attendance_settings` 的列定义。
 *
 * 抽成常量是因为它有**两份消费者**：首次建表（SCHEMA）与老库重建
 * （`migrateAttendanceModeCheck`：SQLite 改不了 CHECK 约束，只能整表重建）。
 * 两处各写一份迟早会漂移，重建出来的表就跟新库不一样了。
 */
const ATTENDANCE_SETTINGS_COLUMNS = `
  user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  saturday_mode   TEXT    NOT NULL CHECK (saturday_mode IN ('work', 'off', 'alternate')),
  anchor_saturday TEXT,                    -- 仅 'alternate' 用：交替从哪个周六起算
  anchor_is_work  INTEGER CHECK (anchor_is_work IN (0, 1)),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  -- 交替模式必须带锚点；单休 / 双休时两列为 NULL
  CHECK (saturday_mode <> 'alternate'
         OR (anchor_saturday IS NOT NULL AND anchor_is_work IS NOT NULL))
`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL,          -- 展示用，保留用户输入的大小写
  username_key  TEXT    NOT NULL UNIQUE,   -- 归一化（小写）后的唯一键
  password_hash TEXT    NOT NULL,          -- 自描述格式，见 password.ts
  created_at    INTEGER NOT NULL           -- 毫秒时间戳
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT    NOT NULL UNIQUE,      -- sha256(cookie 中的原文)
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS sticky_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,   -- 0 / 1，SQLite 没有布尔类型
  pinned_at  INTEGER,                      -- 置顶时刻（毫秒）；NULL = 未置顶。置顶组内排序用
  created_at INTEGER NOT NULL,             -- 毫秒时间戳
  updated_at INTEGER NOT NULL              -- 毫秒时间戳；只有改正文才刷新，置顶不刷新
);

CREATE INDEX IF NOT EXISTS idx_sticky_notes_user_id ON sticky_notes(user_id);

CREATE TABLE IF NOT EXISTS todos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  completed_at INTEGER,                    -- 完成时刻（毫秒）；NULL = 还没做完
  created_at   INTEGER NOT NULL            -- 毫秒时间戳
);

CREATE INDEX IF NOT EXISTS idx_todos_user_id ON todos(user_id);

CREATE TABLE IF NOT EXISTS attendance_settings (${ATTENDANCE_SETTINGS_COLUMNS});

CREATE TABLE IF NOT EXISTS attendance_overrides (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key    TEXT    NOT NULL,             -- 'YYYY-MM-DD'
  status     TEXT    NOT NULL CHECK (status IN ('work', 'off')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day_key)
) WITHOUT ROWID;
`;

/** 建表（幂等）。单独导出，测试可以在任意连接上初始化结构。 */
export function initSchema(conn: Db): void {
  // 先迁移表名，再建表 —— 顺序不能反（理由见 migrateLegacyTableNames）
  migrateLegacyTableNames(conn);
  conn.exec(SCHEMA);
  // 建表之后补列：`CREATE TABLE IF NOT EXISTS` 对已存在的表是空操作，老库不会自动多出列
  migrateStickyNotePinnedAt(conn);
  // 建表之后搬数据：新表已经在了，老表还留着行
  migrateAttendanceCycles(conn);
  migrateAttendanceAnchor(conn);
  migrateAttendanceModeCheck(conn);
  // 建表之后删列：`note` 是空壳列（理由见 migrateAttendanceOverrideNote）
  migrateAttendanceOverrideNote(conn);
}


/**
 * 删列：`attendance_overrides.note`（2026-10-24）。
 *
 * 这列建出来却**没有任何写入路径**——弹层里没有备注输入框，`saveOverride` 恒写 NULL，
 * 界面上也不显示。一个永远是 NULL 的列会让读代码的人以为「备注功能是有的」，
 * 而文档里那句「带备注的日子显示小字」根本不成立；空壳比没有这个功能更糟，所以删掉
 * （《功能/工作日历》§三「没有 note 列」）。
 *
 * 用 SQLite 3.35+ 的 `DROP COLUMN`（better-sqlite3 12 内置的版本远高于它）。
 * `note` 既不是主键也不是索引列，删它不影响 `WITHOUT ROWID` 与复合主键。
 * 幂等：新库按 SCHEMA 建出来本来就没有这列，看到没有就什么都不做。
 */
function migrateAttendanceOverrideNote(conn: Db): void {
  const columns = conn
    .prepare("PRAGMA table_info(attendance_overrides)")
    .all() as { name: string }[];
  if (!columns.some((column) => column.name === "note")) return;
  conn.exec("ALTER TABLE attendance_overrides DROP COLUMN note");
}


/**
 * 出勤设置补列：`anchor_saturday` / `anchor_is_work`（交替模式的锚点）。
 *
 * 为什么加：2026-10-23 联调第二轮，主人在单休 / 双休之外要「单双休（大小周）」——
 * 本周单休、下周双休这样交替。交替必须知道**从哪一周起算**，否则每次读取都用
 * 「今天所在的那一周」当起点，结果会随着日子往前走而漂移。
 *
 * 老库（只有 `saturday_mode` 四列）补成两列 NULL：那一版只有单休 / 双休，
 * 本来就没有锚点，NULL 就是正确值。幂等：列已存在就什么都不做。
 * 必须跑在 `migrateAttendanceModeCheck` **之前**：整表重建时要按六列搬行。
 * 注意 SQLite 的 `ALTER TABLE ADD COLUMN` 带不上表级 CHECK，所以老库补出来的两列
 * 只有应用层校验兜底；新库由 SCHEMA 里的 CHECK 管住。
 */
function migrateAttendanceAnchor(conn: Db): void {
  const columns = conn
    .prepare("PRAGMA table_info(attendance_settings)")
    .all() as { name: string }[];

  // 新库：表是上面 SCHEMA 刚建的，已经带这两列
  if (columns.length === 0) return;
  if (columns.some((column) => column.name === "anchor_saturday")) return;

  conn.exec("ALTER TABLE attendance_settings ADD COLUMN anchor_saturday TEXT");
  conn.exec("ALTER TABLE attendance_settings ADD COLUMN anchor_is_work INTEGER");
}

/**
 * 补「单双休」这一档时，老表的 `CHECK (saturday_mode IN ('work', 'off'))` 会把
 * `'alternate'` 直接拒掉（`SqliteError: CHECK constraint failed`）。
 *
 * SQLite **改不了已有的 CHECK**，只能整表重建：改名 → 按新列定义建表 → 搬行 → 删老表。
 * 判断依据是建表语句里有没有 `'alternate'`；有就什么都不做（幂等）。
 * 整个过程包在一个事务里：中途失败不会留下「表建了一半」的库。
 */
function migrateAttendanceModeCheck(conn: Db): void {
  const table = conn
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attendance_settings'",
    )
    .get() as { sql: string } | undefined;
  if (!table) return;
  if (table.sql.includes("'alternate'")) return;

  conn.exec(`
    BEGIN;
    ALTER TABLE attendance_settings RENAME TO attendance_settings_legacy;
    CREATE TABLE attendance_settings (${ATTENDANCE_SETTINGS_COLUMNS});
    INSERT INTO attendance_settings
      (user_id, saturday_mode, anchor_saturday, anchor_is_work, created_at, updated_at)
    SELECT user_id, saturday_mode, anchor_saturday, anchor_is_work, created_at, updated_at
    FROM attendance_settings_legacy;
    DROP TABLE attendance_settings_legacy;
    COMMIT;
  `);
}

/**
 * 出勤设置的老表迁移：`attendance_cycles`（一个基准周六 + 那周上不上班）→
 * `attendance_settings`（一个全局的周六制度：单休 / 双休）。
 *
 * 为什么结构换了：2026-10-23 联调时 ogliu 把口径定成「设置里直接选单休或双休，全年按它算」，
 * 原来那套「基准周六 + 两周交替」的循环在当时被砍掉，表从 cycles 换成了 settings。
 *
 * 老库里的那一行仍然带着他的心意（那周的周六上不上班），搬成全局制度：
 * `anchor_is_work = 1` → `saturday_mode = 'work'`（单休），否则 `'off'`（双休）。
 * 搬完就把老表删掉——它随本功能诞生、尚未上线，除了这条设置没有别的数据要留。
 * 幂等：新库里没有 `attendance_cycles`，直接跳过。
 */
function migrateAttendanceCycles(conn: Db): void {
  if (!tableExists(conn, "attendance_cycles")) return;

  const rows = conn
    .prepare(
      "SELECT user_id, anchor_is_work, created_at, updated_at FROM attendance_cycles",
    )
    .all() as {
    user_id: number;
    anchor_is_work: number;
    created_at: number;
    updated_at: number;
  }[];

  const insert = conn.prepare(
    `INSERT OR IGNORE INTO attendance_settings (user_id, saturday_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
  );
  for (const row of rows) {
    insert.run(
      row.user_id,
      row.anchor_is_work === 1 ? "work" : "off",
      row.created_at,
      row.updated_at,
    );
  }

  conn.exec("DROP TABLE attendance_cycles");
}

/**
 * 便签表补列：`pinned_at`（置顶时刻）。
 *
 * 为什么需要这一列：置顶组内原本按 `updated_at` 排，而置顶动作**不刷新** `updated_at`，
 * 所以刚置顶的旧便签会沉到置顶区末尾；要「最新置顶的排第一」，就必须记下置顶时刻。
 *
 * 老数据不知道当时什么时候置顶的，回填成 `updated_at`：
 * 既保留它们原来的相对顺序，也让新置顶的便签自然排到它们前面。
 * 幂等：列已存在就什么都不做，重复启动不会覆盖已有的 `pinned_at`。
 */
function migrateStickyNotePinnedAt(conn: Db): void {
  const columns = conn
    .prepare("PRAGMA table_info(sticky_notes)")
    .all() as { name: string }[];

  // 新库：表是上面 SCHEMA 刚建的，已经带这一列
  if (columns.length === 0) return;
  if (columns.some((column) => column.name === "pinned_at")) return;

  conn.exec("ALTER TABLE sticky_notes ADD COLUMN pinned_at INTEGER");
  conn.exec("UPDATE sticky_notes SET pinned_at = updated_at WHERE pinned = 1");
}

/**
 * 老库的表名迁移（幂等）。
 *
 * 这张登录会话表原来叫 `sessions`。将来做 Agent 相关开发时，「会话」这个词会被用来指
 * **对话线程**，而裸词 `sessions` 显然该属于对话——所以登录凭证改叫 `auth_sessions`，
 * 把那个词让出去（`agent_sessions` / `chat_sessions` 以后都不会撞车）。
 *
 * **必须在建表之前跑**：如果先 `CREATE TABLE IF NOT EXISTS auth_sessions` 再改名，
 * 老库的检查会看到「新表已存在」从而跳过迁移，老的行就被留在 `sessions` 里成了孤儿。
 */
function migrateLegacyTableNames(conn: Db): void {
  const legacy = "sessions";
  const current = "auth_sessions";
  if (!tableExists(conn, legacy) || tableExists(conn, current)) return;

  conn.exec(`ALTER TABLE ${legacy} RENAME TO ${current}`);
  // SQLite 改名表时不会跟着改索引名，旧名字会留在新表上；丢掉，由 SCHEMA 按新名字重建
  conn.exec("DROP INDEX IF EXISTS idx_sessions_user_id");
}

function tableExists(conn: Db, name: string): boolean {
  const row = conn
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { found: number } | undefined;
  return row !== undefined;
}

/** 在指定文件（或 ":memory:"）上开一个配置好 pragma 的连接，并保证表结构存在。 */
export function createConnection(file: string): Db {
  const conn = new Database(file);
  // WAL：读写不互斥，读请求不会卡住写请求
  conn.pragma("journal_mode = WAL");
  // SQLite 默认**关闭**外键约束，不打开则 auth_sessions 的 ON DELETE CASCADE 形同虚设
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

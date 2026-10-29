import type { Db } from "@/lib/auth/db";

/**
 * 保险库的数据访问（《功能/保险库》§三、《数据库/保险库群组表》《数据库/保险库条目表》）。
 *
 * 分工同便签：这里只碰数据库，不碰 cookie 与请求上下文；服务端动作在 `actions.ts`，
 * 校验在 `validate.ts`。
 *
 * **所有函数都要求传 `userId`，并且每条 SQL 都带 `user_id = ?`**——账户隔离不是
 * 「界面藏起来」，而是「查不到」。A 账户的群组 / 条目，B 账户的查询不会命中任何一行。
 */

/** 条目里的一个自定义字段。`key` 是字段名（用户自己起），`value` 是值。 */
export interface VaultField {
  key: string;
  value: string;
  /**
   * 默认要不要遮挡（眼睛闭着）。缺省 = 不遮挡。
   *
   * **这个落库，和「临时点开看一眼」是两回事**：它回答「这条记录的这一格，
   * 我一打开就想不想看见」——是用户对数据的设定，所以跟着记录存。
   * 临时点眼睛只是改变这一刻的显示，不写回。
   */
  hidden?: boolean;
}

/** 对外的条目表示（camelCase）。库里的 `fields` 是 JSON 文本，这里已经是数组。 */
export interface VaultItem {
  id: number;
  groupId: number | null;
  title: string;
  fields: VaultField[];
  createdAt: number;
  updatedAt: number;
}

/** 对外的群组表示。`itemCount` 是查出来的，不是存的（详见群组表文档 §二）。 */
export interface VaultGroup {
  id: number;
  name: string;
  createdAt: number;
  itemCount: number;
}

/** 新建 / 编辑条目时传进来的东西。 */
export interface VaultItemInput {
  title: string;
  groupId: number | null;
  fields: VaultField[];
}

/** 数据库里的条目行。 */
interface VaultItemRow {
  id: number;
  group_id: number | null;
  title: string;
  fields: string;
  created_at: number;
  updated_at: number;
}

interface VaultGroupRow {
  id: number;
  name: string;
  created_at: number;
  item_count: number;
}

const ITEM_COLUMNS = "id, group_id, title, fields, created_at, updated_at";

/**
 * 把库里的 JSON 文本还原成字段数组。**坏数据不能把整个列表弄崩**：
 * 库里这一列是文本，理论上可能被手工改坏（或用旧版本的格式写进去过）。
 * 解析失败按「没有字段」处理并留一条服务端日志，界面照常显示，用户至少能看到标题与时间。
 */
export function parseFields(raw: string): VaultField[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[vault] fields 不是合法 JSON，按空字段处理：", raw.slice(0, 120));
    return [];
  }
  if (!Array.isArray(parsed)) {
    console.warn("[vault] fields 不是数组，按空字段处理：", raw.slice(0, 120));
    return [];
  }
  // 逐项过滤：只收 k/v 都是字符串的元素，别的形状一律丢掉
  return parsed.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { key, value, hidden } = entry as {
      key?: unknown;
      value?: unknown;
      hidden?: unknown;
    };
    if (typeof key !== "string" || typeof value !== "string") return [];
    return [{ key, value, hidden: hidden === true }];
  });
}

/** 字段数组 → 存库的 JSON 文本。顺序就是用户拖出来的顺序，不排序。 */
export function serializeFields(fields: VaultField[]): string {
  return JSON.stringify(
    fields.map(({ key, value, hidden }) => ({ key, value, hidden: hidden === true })),
  );
}

function toItem(row: VaultItemRow): VaultItem {
  return {
    id: row.id,
    groupId: row.group_id,
    title: row.title,
    fields: parseFields(row.fields),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 排序只有一处：**最近改过的在最上面**，末尾 `id DESC` 兜住毫秒撞车的两条。 */
const ITEM_ORDER = "ORDER BY updated_at DESC, id DESC";

// ---------------------------------------------------------------- 群组

/** 左栏：这个人的全部群组，按**建组顺序**（建得早的在上）带条目数。 */
export function listGroups(db: Db, userId: number): VaultGroup[] {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.created_at,
              (SELECT COUNT(*) FROM vault_items i
                WHERE i.group_id = g.id AND i.user_id = g.user_id) AS item_count
         FROM vault_groups g
        WHERE g.user_id = ?
        ORDER BY g.created_at ASC, g.id ASC`,
    )
    .all(userId) as VaultGroupRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    itemCount: row.item_count,
  }));
}

/** 群组是否存在**且属于这个人**。跨用户传入别人的群组 id 时返回 false（服务端据此拒绝）。 */
export function groupExists(db: Db, userId: number, groupId: number): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM vault_groups WHERE id = ? AND user_id = ?")
    .get(groupId, userId) as { found: number } | undefined;
  return row !== undefined;
}

/** 新建群组。重名返回 `"duplicate"`（由 `(user_id, name)` 唯一约束报错，再翻译成人话）。 */
export function createGroup(
  db: Db,
  userId: number,
  name: string,
  now = Date.now(),
): { ok: true; id: number } | { ok: false; error: "duplicate" } {
  try {
    const result = db
      .prepare("INSERT INTO vault_groups (user_id, name, created_at) VALUES (?, ?, ?)")
      .run(userId, name, now);
    return { ok: true, id: Number(result.lastInsertRowid) };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicate" };
    throw error;
  }
}

/** 重命名群组。群组不存在 / 不属于这个人 → `"missing"`；撞名 → `"duplicate"`。 */
export function renameGroup(
  db: Db,
  userId: number,
  groupId: number,
  name: string,
): "ok" | "missing" | "duplicate" {
  if (!groupExists(db, userId, groupId)) return "missing";
  try {
    db.prepare("UPDATE vault_groups SET name = ? WHERE id = ? AND user_id = ?").run(
      name,
      groupId,
      userId,
    );
    return "ok";
  } catch (error) {
    if (isUniqueViolation(error)) return "duplicate";
    throw error;
  }
}

/**
 * 删除群组（真删）。
 *
 * 组内条目**不删**：`vault_items.group_id` 上是 `ON DELETE SET NULL`，
 * 删掉群组行后它们自动变成未分组。这依赖 `foreign_keys = ON`（`createConnection()` 已开）。
 */
export function deleteGroup(db: Db, userId: number, groupId: number): boolean {
  const result = db
    .prepare("DELETE FROM vault_groups WHERE id = ? AND user_id = ?")
    .run(groupId, userId);
  return result.changes > 0;
}

// ---------------------------------------------------------------- 条目

/**
 * 取条目列表。
 *
 * - `groupId === undefined`：这个人的**全部**条目（左栏「所有条目」）
 * - `groupId === null`：**未分组**的条目
 * - `groupId` 是数字：该群组的条目
 */
export function listItems(db: Db, userId: number, groupId?: number | null): VaultItem[] {
  const base = `SELECT ${ITEM_COLUMNS} FROM vault_items WHERE user_id = ?`;
  let rows: VaultItemRow[];

  if (groupId === undefined) {
    rows = db.prepare(`${base} ${ITEM_ORDER}`).all(userId) as VaultItemRow[];
  } else if (groupId === null) {
    rows = db
      .prepare(`${base} AND group_id IS NULL ${ITEM_ORDER}`)
      .all(userId) as VaultItemRow[];
  } else {
    rows = db
      .prepare(`${base} AND group_id = ? ${ITEM_ORDER}`)
      .all(userId, groupId) as VaultItemRow[];
  }

  return rows.map(toItem);
}

export function getItem(db: Db, userId: number, itemId: number): VaultItem | null {
  const row = db
    .prepare(`SELECT ${ITEM_COLUMNS} FROM vault_items WHERE id = ? AND user_id = ?`)
    .get(itemId, userId) as VaultItemRow | undefined;
  return row ? toItem(row) : null;
}

/** 新建条目。调用前必须已经校验过 `groupId` 属于这个人（`actions.ts` 负责）。 */
export function createItem(
  db: Db,
  userId: number,
  input: VaultItemInput,
  now = Date.now(),
): VaultItem {
  const result = db
    .prepare(
      `INSERT INTO vault_items (user_id, group_id, title, fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, input.groupId, input.title, serializeFields(input.fields), now, now);

  const created = getItem(db, userId, Number(result.lastInsertRowid));
  // 刚插进去的行一定查得到；查不到说明连接/事务被外部弄坏了，直接抛比返回 null 好排查
  if (!created) throw new Error("条目刚创建却查不到");
  return created;
}

/** 改条目（标题 / 字段 / 所属群组）。刷新 `updated_at`：改完要浮到列表最上面。 */
export function updateItem(
  db: Db,
  userId: number,
  itemId: number,
  input: VaultItemInput,
  now = Date.now(),
): boolean {
  const result = db
    .prepare(
      `UPDATE vault_items
          SET group_id = ?, title = ?, fields = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    )
    .run(input.groupId, input.title, serializeFields(input.fields), now, itemId, userId);
  return result.changes > 0;
}

export function deleteItem(db: Db, userId: number, itemId: number): boolean {
  const result = db
    .prepare("DELETE FROM vault_items WHERE id = ? AND user_id = ?")
    .run(itemId, userId);
  return result.changes > 0;
}

/**
 * 批量改群组（「移动到」）。`groupId` 传 `null` 就是移到未分组。
 *
 * `updated_at` 一起刷新：移完立刻要在新群组里一眼看到（否则按旧时间沉在下面）。
 * 返回真正被改动的行数——前端据此判断「是不是一条都没动」（比如选中项已被别处删掉）。
 */
export function moveItems(
  db: Db,
  userId: number,
  itemIds: number[],
  groupId: number | null,
  now = Date.now(),
): number {
  if (itemIds.length === 0) return 0;
  const placeholders = itemIds.map(() => "?").join(", ");
  const result = db
    .prepare(
      `UPDATE vault_items SET group_id = ?, updated_at = ?
        WHERE user_id = ? AND id IN (${placeholders})`,
    )
    .run(groupId, now, userId, ...itemIds);
  return result.changes;
}

/** 批量删除。返回删掉的行数。 */
export function deleteItems(db: Db, userId: number, itemIds: number[]): number {
  if (itemIds.length === 0) return 0;
  const placeholders = itemIds.map(() => "?").join(", ");
  const result = db
    .prepare(`DELETE FROM vault_items WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...itemIds);
  return result.changes;
}

// ---------------------------------------------------------------- 派生数据

/**
 * 中栏列头的来源：这些条目的字段名**并集**，按首次出现顺序，最多 `limit` 个。
 *
 * 为什么取并集：同一群组里的记录结构通常一致（都是「卡号 / 密码 / 客服电话」），
 * 并集才能横向比较；按首次出现顺序排，列头不会随选中项跳动。
 * 为什么封顶：中栏再宽也就 900px，5 个字段列加上标题与时间会挤成一条缝。
 */
export function collectFieldKeys(items: VaultItem[], limit = 4): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const field of item.fields) {
      if (!seen.has(field.key)) seen.add(field.key);
      if (seen.size >= limit) return [...seen];
    }
  }
  return [...seen];
}

/**
 * 新建时用的默认标题：`未命名`，撞了就给 `未命名 2`、`未命名 3`……
 *
 * 只在一处算：标题撞名是「用户没起名」的副产品，不该散落在界面里。
 * `LIKE '未命名%'` 会连「未命名说明」这种标题一起捞回来，所以下面还要按**精确形态**过滤。
 */
export function nextUntitledTitle(db: Db, userId: number): string {
  const rows = db
    .prepare("SELECT title FROM vault_items WHERE user_id = ? AND title LIKE '未命名%'")
    .all(userId) as { title: string }[];

  const used = new Set(rows.map((row) => row.title));
  if (!used.has("未命名")) return "未命名";

  let suffix = 2;
  while (used.has(`未命名 ${suffix}`)) suffix += 1;
  return `未命名 ${suffix}`;
}

/** 标题是否已被占用（只在「用户没自己起名」时用来决定要不要补序号）。 */
export function titleTaken(db: Db, userId: number, title: string): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM vault_items WHERE user_id = ? AND title = ? LIMIT 1")
    .get(userId, title) as { found: number } | undefined;
  return row !== undefined;
}

/** better-sqlite3 的唯一约束错误：`SqliteError: UNIQUE constraint failed: ...` */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}

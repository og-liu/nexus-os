import type { Db } from "@/lib/auth/db";

/**
 * 文档标签的数据访问（《数据库/Markdown标签表》）。
 *
 * 为什么是标签而不是「分组」：一篇文档常常同时属于两类（`工作/周报` + `重要`），
 * 一个 `group_id` 装不下；而且标签可以只建、不用——**文档一个标签都没有是合法状态**。
 *
 * **层级靠命名约定**：标签名里带 `/` 就是一层，`工作/周报` 是 `工作` 的子标签。
 * 筛选 `工作` 时把 `工作/周报` 也算进来（前缀匹配）。这样不用建树表，
 * 但代价是改名要连带改子标签（见 `renameTag`）。
 */

/** 单个标签的对外表示。`count` 是「多少篇文档在用它」，chips 按它排序。 */
export interface MdTag {
  id: number;
  name: string;
  count: number;
}

/** 挂在某篇文档上的标签（列表里用，不需要计数）。 */
export interface MdDocumentTag {
  id: number;
  name: string;
}

/** 标签名的归一化键：`工作` / `工作 ` / `Work` 归一后分别相等或不等，用来判重。 */
export function tagKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** 标签名上限。太长会把左栏 chips 撑爆，也没什么用。 */
export const TAG_NAME_MAX = 30;
/** 一篇文档最多挂多少个标签。防手滑，也防 chips 条失控。 */
export const TAGS_PER_DOCUMENT_MAX = 12;

/** 归一化 + 校验一行输入；不合法返回 `null`（调用方跳过这一条）。 */
export function normalizeTagName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // 名字里的「/」两侧空白统一去掉：`工作 / 周报` → `工作/周报`
  const name = raw
    .trim()
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .replace(/^\/+|\/+$/g, "");
  if (name === "") return null;
  if (Array.from(name).length > TAG_NAME_MAX) return null;
  if (tagKey(name) === "") return null;
  return name;
}

/** 去重 + 归一化一批名字（保持输入顺序）。 */
export function normalizeTagNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const entry of raw) {
    const name = normalizeTagName(entry);
    if (!name) continue;
    const key = tagKey(name);
    if (names.some((existing) => tagKey(existing) === key)) continue;
    names.push(name);
    if (names.length >= TAGS_PER_DOCUMENT_MAX) break;
  }
  return names;
}

/** 这个标签名是不是 `prefix` 本身或它的子标签。 */
export function tagMatchesPrefix(nameKey: string, prefixKey: string): boolean {
  return nameKey === prefixKey || nameKey.startsWith(`${prefixKey}/`);
}

// ---------------------------------------------------------------- 查询

/** 左栏的标签 chips：按使用次数从多到少，同次数按名字。 */
export function listTags(db: Db, userId: number): MdTag[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.name,
              (SELECT COUNT(*) FROM md_document_tags dt
                JOIN md_documents d ON d.id = dt.document_id
               WHERE dt.tag_id = t.id AND d.user_id = t.user_id) AS count
         FROM md_tags t
        WHERE t.user_id = ?
        ORDER BY count DESC, t.name`,
    )
    .all(userId) as { id: number; name: string; count: number }[];
  return rows;
}

/**
 * 这个人的每篇文档挂了哪些标签 —— 一次查完，避免列表里逐篇查一遍。
 * 返回 `Map<documentId, MdDocumentTag[]>`；没标签的文档不在 Map 里（读的时候兜空数组）。
 */
export function tagsByDocument(db: Db, userId: number): Map<number, MdDocumentTag[]> {
  const rows = db
    .prepare(
      `SELECT dt.document_id, t.id, t.name
         FROM md_document_tags dt
         JOIN md_tags t ON t.id = dt.tag_id
         JOIN md_documents d ON d.id = dt.document_id
        WHERE d.user_id = ? AND t.user_id = ?
        ORDER BY t.name`,
    )
    .all(userId, userId) as { document_id: number; id: number; name: string }[];

  const map = new Map<number, MdDocumentTag[]>();
  for (const row of rows) {
    const bucket = map.get(row.document_id);
    if (bucket) bucket.push({ id: row.id, name: row.name });
    else map.set(row.document_id, [{ id: row.id, name: row.name }]);
  }
  return map;
}

/** 某篇文档的标签（按名字排）。 */
export function listDocumentTags(db: Db, userId: number, documentId: number): MdDocumentTag[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.name
         FROM md_document_tags dt
         JOIN md_tags t ON t.id = dt.tag_id
         JOIN md_documents d ON d.id = dt.document_id
        WHERE dt.document_id = ? AND d.user_id = ? AND t.user_id = ?
        ORDER BY t.name`,
    )
    .all(documentId, userId, userId) as { id: number; name: string }[];
  return rows;
}

// ---------------------------------------------------------------- 写入

/**
 * 单独建一个标签（不带任何文档）——「标签管理」面板里的新建用它。
 * 重名（只差大小写/空格也算）返回 `"duplicate"`，名字不合法返回 `"invalid"`。
 */
export function createTag(
  db: Db,
  userId: number,
  rawName: unknown,
  now = Date.now(),
): "ok" | "duplicate" | "invalid" {
  const name = normalizeTagName(rawName);
  if (!name) return "invalid";

  const key = tagKey(name);
  const existing = db
    .prepare("SELECT 1 AS found FROM md_tags WHERE user_id = ? AND name_key = ?")
    .get(userId, key) as { found: number } | undefined;
  if (existing) return "duplicate";

  db.prepare("INSERT INTO md_tags (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)").run(
    userId,
    name,
    key,
    now,
  );
  return "ok";
}

/**
 * 把名字换成标签 id：没有就顺手建出来（用户打一个新词回车，就应该有这个标签）。
 *
 * 唯一约束是 `(user_id, name_key)`：两个人（或同一人两次输入大小写不同）会撞在
 * 同一个键上，所以用 `INSERT OR IGNORE` + 回查，天然幂等。
 */
function resolveTagIds(db: Db, userId: number, names: string[], now = Date.now()): number[] {
  const ids: number[] = [];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO md_tags (user_id, name, name_key, created_at) VALUES (?, ?, ?, ?)`,
  );
  const find = db.prepare("SELECT id, name FROM md_tags WHERE user_id = ? AND name_key = ?");
  const update = db.prepare("UPDATE md_tags SET name = ? WHERE id = ? AND user_id = ?");

  for (const name of names) {
    const key = tagKey(name);
    if (key === "") continue;
    insert.run(userId, name, key, now);
    const row = find.get(userId, key) as { id: number; name: string } | undefined;
    if (!row) continue;
    // 用户这次写的大小写/写法与库里不同（`work` vs `Work`）：以最新输入为准
    if (row.name !== name) update.run(name, row.id, userId);
    if (!ids.includes(row.id)) ids.push(row.id);
  }
  return ids;
}

/**
 * 把这篇文档的标签整体换成 `rawNames`（先清空再写，最简单也最不容易出半成品）。
 * 文档不属于这个人 → 返回 `null`（影响 0 行）。
 */
export function setDocumentTags(
  db: Db,
  userId: number,
  documentId: number,
  rawNames: unknown,
): MdDocumentTag[] | null {
  const owns = db
    .prepare("SELECT 1 AS found FROM md_documents WHERE id = ? AND user_id = ?")
    .get(documentId, userId) as { found: number } | undefined;
  if (!owns) return null;

  const names = normalizeTagNames(rawNames);
  const tagIds = resolveTagIds(db, userId, names);

  const replace = db.transaction(() => {
    db.prepare("DELETE FROM md_document_tags WHERE document_id = ?").run(documentId);
    const link = db.prepare(
      "INSERT OR IGNORE INTO md_document_tags (document_id, tag_id) VALUES (?, ?)",
    );
    for (const tagId of tagIds) link.run(documentId, tagId);
  });
  replace();

  return listDocumentTags(db, userId, documentId);
}

/** 重命名标签。同一个人已经有同名标签 → `"duplicate"`；不存在 → `"missing"`。 */
export function renameTag(
  db: Db,
  userId: number,
  tagId: number,
  rawName: unknown,
): "ok" | "missing" | "duplicate" {
  const name = normalizeTagName(rawName);
  if (!name) return "missing";

  const current = db
    .prepare("SELECT id, name, name_key FROM md_tags WHERE id = ? AND user_id = ?")
    .get(tagId, userId) as { id: number; name: string; name_key: string } | undefined;
  if (!current) return "missing";

  const nextKey = tagKey(name);
  if (nextKey !== current.name_key) {
    const clash = db
      .prepare("SELECT 1 AS found FROM md_tags WHERE user_id = ? AND name_key = ? AND id <> ?")
      .get(userId, nextKey, tagId) as { found: number } | undefined;
    if (clash) return "duplicate";
  }

  const rename = db.transaction(() => {
    if (nextKey === current.name_key) {
      db.prepare("UPDATE md_tags SET name = ? WHERE id = ? AND user_id = ?").run(
        name,
        tagId,
        userId,
      );
      return;
    }

    // 改了键就是「搬走」：把自己的子标签（`工作/xxx`）也一起改名，否则层级会断
    db.prepare("UPDATE md_tags SET name = ?, name_key = ? WHERE id = ? AND user_id = ?").run(
      name,
      nextKey,
      tagId,
      userId,
    );

    const children = db
      .prepare("SELECT id, name, name_key FROM md_tags WHERE user_id = ? AND name_key LIKE ?")
      .all(userId, `${current.name_key}/%`) as {
      id: number;
      name: string;
      name_key: string;
    }[];
    for (const child of children) {
      const suffix = child.name.replace(/^[^/]*\//, "");
      const childName = `${name}/${suffix}`;
      db.prepare("UPDATE md_tags SET name = ?, name_key = ? WHERE id = ? AND user_id = ?").run(
        childName,
        tagKey(childName),
        child.id,
        userId,
      );
    }
  });
  rename();

  return "ok";
}

/** 删标签：只解除关联，文档不删（`ON DELETE CASCADE` 只删关联行）。返回是否删掉了。 */
export function deleteTag(db: Db, userId: number, tagId: number): boolean {
  const result = db.prepare("DELETE FROM md_tags WHERE id = ? AND user_id = ?").run(tagId, userId);
  return result.changes > 0;
}

/** 批量删标签：一条 SQL，`user_id` 兜归属；返回真正删掉的数量。 */
export function deleteTags(db: Db, userId: number, ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  const result = db
    .prepare(`DELETE FROM md_tags WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...ids);
  return result.changes;
}

/** 这个标签正在被多少篇文档使用（删除确认框要显示这个数）。 */
export function countTagDocuments(db: Db, userId: number, tagId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count
         FROM md_document_tags dt
         JOIN md_documents d ON d.id = dt.document_id
        WHERE dt.tag_id = ? AND d.user_id = ?`,
    )
    .get(tagId, userId) as { count: number } | undefined;
  return row?.count ?? 0;
}

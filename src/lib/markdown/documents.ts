import type { Db } from "@/lib/auth/db";
import { tagsByDocument, type MdDocumentTag } from "./tags";
import { UNTITLED } from "./validate";

/**
 * Markdown 文档的数据访问（《功能/Markdown编辑器》§三、《数据库/Markdown文档表》）。
 *
 * 分工同便签 / 保险库：这里只碰数据库，不碰 cookie 与请求上下文；服务端动作在
 * `actions.ts`，校验在 `validate.ts`。
 *
 * **所有函数都要求传 `userId`，并且每条 SQL 都带 `user_id = ?`**——账户隔离不是
 * 「界面藏起来」，而是「查不到、改不动」：A 的文档，B 的读 / 写 / 删都不命中任何一行。
 */

/** 列表里的一行（左栏只需要标题 / 时间 / 标签，不用把正文一起拉到客户端）。 */
export interface MdDocumentSummary {
  id: number;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** 挂在这篇上的标签（一个都没有是合法状态）。 */
  tags: MdDocumentTag[];
}

/** 打开一篇文档时的完整数据。 */
export interface MdDocument extends MdDocumentSummary {
  body: string;
}

/** 数据库里的行。 */
interface MdDocumentRow {
  id: number;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
}

const FULL_COLUMNS = "id, title, body, created_at, updated_at";

/**
 * 排序只有一处：**最近改过的在最上面**。
 * 末尾 `id DESC` 兜住「同一毫秒保存的两篇」——毫秒会撞车，少了它两行会互换位置
 * （《数据库/README》§六第 5 条）。
 */
const DOCUMENT_ORDER = "ORDER BY updated_at DESC, id DESC";

function toSummary(row: Omit<MdDocumentRow, "body">, tags: MdDocumentTag[]): MdDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
  };
}

function toDocument(row: MdDocumentRow, tags: MdDocumentTag[]): MdDocument {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tags,
  };
}

/** 左栏：这个人的全部文档摘要，最近改的在最上面。 */
export function listDocuments(db: Db, userId: number): MdDocumentSummary[] {
  const rows = db
    .prepare(
      `SELECT id, title, created_at, updated_at
         FROM md_documents
        WHERE user_id = ?
        ${DOCUMENT_ORDER}`,
    )
    .all(userId) as Omit<MdDocumentRow, "body">[];

  // 标签一次查完（不是每行查一次），没标签的文档读出来就是空数组
  const tags = tagsByDocument(db, userId);
  return rows.map((row) => toSummary(row, tags.get(row.id) ?? []));
}

/** 打开一篇。不存在 / 不属于这个人 → `null`（服务端据此回「文档不存在」）。 */
export function getDocument(db: Db, userId: number, id: number): MdDocument | null {
  const row = db
    .prepare(`SELECT ${FULL_COLUMNS} FROM md_documents WHERE id = ? AND user_id = ?`)
    .get(id, userId) as MdDocumentRow | undefined;
  if (!row) return null;
  const tags = tagsByDocument(db, userId);
  return toDocument(row, tags.get(row.id) ?? []);
}

/** 新建一篇。`created_at` 与 `updated_at` 初始相同。 */
export function createDocument(
  db: Db,
  userId: number,
  title: string,
  body = "",
  now = Date.now(),
): MdDocument {
  const result = db
    .prepare(
      `INSERT INTO md_documents (user_id, title, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, title, body, now, now);

  const created = getDocument(db, userId, Number(result.lastInsertRowid));
  // 刚插进去的行一定查得到；查不到说明连接 / 事务被外部弄坏了，直接抛比返回 null 好排查
  if (!created) throw new Error("文档刚创建却查不到");
  return created;
}

/**
 * 保存（标题与正文一起写，或只写其中一个）。
 *
 * **只刷新 `updated_at`，`created_at` 一个字节都不动**：前者是「这篇什么时候动过」，
 * 后者是「这篇什么时候建的」，保存顺手改掉后者就等于把历史改坏了。
 * 返回最新的整行（含服务端算出的 `updated_at`），界面据此只更新列表里那一行。
 * 文档不存在 / 不属于这个人 → `null`（`user_id = ?` 让它变成「影响行数 0」）。
 */
export function saveDocument(
  db: Db,
  userId: number,
  id: number,
  input: { title: string; body: string },
  now = Date.now(),
): MdDocument | null {
  const result = db
    .prepare(
      `UPDATE md_documents
          SET title = ?, body = ?, updated_at = ?
        WHERE id = ? AND user_id = ?`,
    )
    .run(input.title, input.body, now, id, userId);

  if (result.changes === 0) return null;
  return getDocument(db, userId, id);
}

/**
 * 批量删除（真删）。`user_id = ?` 兜住归属：别人的 id 混进来只是「命中 0 行」，
 * 不会删错东西。返回真正删掉的行数。
 */
export function deleteDocuments(db: Db, userId: number, ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(", ");
  const result = db
    .prepare(`DELETE FROM md_documents WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...ids);
  return result.changes;
}

/** 删除（真删）。返回是否真的删掉了一行。 */
export function deleteDocument(db: Db, userId: number, id: number): boolean {
  const result = db
    .prepare("DELETE FROM md_documents WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

/**
 * 没标题时用的默认标题：`未命名文档`，撞了就给 `未命名文档 2`、`未命名文档 3`……
 *
 * 只在一处算：补序号是「用户没起名」的副产品，不该散落在界面里。
 * `LIKE '未命名文档%'` 会连「未命名文档说明」这种标题一起捞回来，
 * 所以下面按**精确形态**比对（`Set` 里查的是完整标题）。
 *
 * 用户自己起的名字即使撞名也不动：两篇都叫「灵感」是合法的，
 * 文档靠 `id` 认，不靠名字认（《数据库/Markdown文档表》§七）。
 */
export function nextUntitledTitle(
  db: Db,
  userId: number,
  /** 保存一篇已有的文档时传它：把「自己现在这个名字」从占用列表里排除，否则会白跳一号。 */
  excludeId?: number,
): string {
  const rows = db
    .prepare("SELECT id, title FROM md_documents WHERE user_id = ? AND title LIKE ?")
    .all(userId, `${UNTITLED}%`) as { id: number; title: string }[];

  const used = new Set(
    rows.filter((row) => row.id !== excludeId).map((row) => row.title),
  );
  if (!used.has(UNTITLED)) return UNTITLED;

  let suffix = 2;
  while (used.has(`${UNTITLED} ${suffix}`)) suffix += 1;
  return `${UNTITLED} ${suffix}`;
}

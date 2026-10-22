import type { Db } from "@/lib/auth/db";

/**
 * 便签的数据访问（《数据库/便签表》《功能/便签》§三）。
 *
 * 分工：这里只碰数据库，不碰 cookie 与请求上下文；服务端操作在 `actions.ts`。
 * 所有查询都带 `user_id = ?`——归属从第一天就生效，不是「反正只有一个用户」的自觉。
 */

/** 对外的便签表示（camelCase）。库里的行是 snake_case，转换只在 `toNote` 一处发生。 */
export interface StickyNote {
  id: number;
  body: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 数据库里的行。 */
interface StickyNoteRow {
  id: number;
  body: string;
  pinned: number;
  created_at: number;
  updated_at: number;
}

const SELECT_COLUMNS = "id, body, pinned, created_at, updated_at";

function toNote(row: StickyNoteRow): StickyNote {
  return {
    id: row.id,
    body: row.body,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 按界面顺序取便签：**置顶优先 → 置顶时间倒序 → 更新时间倒序 → id 倒序**。
 *
 * 置顶组内按 `pinned_at`（什么时候置顶的）倒序，而不是 `updated_at`：
 * 置顶不刷新更新时间，若按更新时间排，刚置顶的旧便签会沉到置顶区末尾，找都找不到。
 * 未置顶的 `pinned_at` 为 NULL，组内仍按更新时间倒序。
 *
 * 排序规则只写在这里一处：工具页（不传 `limit`）与首页（`limit: 3`）共用，
 * 两边各写一条 SQL 迟早会不一致。
 * 末尾 `id DESC` 是稳定排序的兜底——毫秒时间戳会撞车，SQL 不保证等值行的顺序。
 */
export function listNotes(
  db: Db,
  userId: number,
  limit?: number,
): StickyNote[] {
  const base = `SELECT ${SELECT_COLUMNS} FROM sticky_notes
     WHERE user_id = ?
     ORDER BY pinned DESC, pinned_at DESC, updated_at DESC, id DESC`;

  const rows =
    limit === undefined
      ? (db.prepare(base).all(userId) as StickyNoteRow[])
      : (db.prepare(`${base} LIMIT ?`).all(userId, limit) as StickyNoteRow[]);

  return rows.map(toNote);
}

/** 新建一张便签（立即落库；`pinned` 默认不置顶）。 */
export function createNote(
  db: Db,
  userId: number,
  body: string,
  now = Date.now(),
): StickyNote {
  const result = db
    .prepare(
      "INSERT INTO sticky_notes (user_id, body, pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
    )
    .run(userId, body, now, now);

  return {
    id: Number(result.lastInsertRowid),
    body,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 改正文并刷新 `updated_at`。
 *
 * 返回是否命中：便签不存在、或不属于该用户时 `changes` 为 0——
 * 归属校验就落在这条 `AND user_id = ?` 上，调用方据此判失败。
 */
export function updateNoteBody(
  db: Db,
  userId: number,
  noteId: number,
  body: string,
  now = Date.now(),
): boolean {
  const result = db
    .prepare(
      "UPDATE sticky_notes SET body = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .run(body, now, noteId, userId);
  return result.changes > 0;
}

/**
 * 置顶 / 取消置顶。
 *
 * 置顶时写 `pinned_at = now`（置顶组内按「最近置顶的在前」排），取消置顶写回 NULL。
 * `pinned` 与 `pinned_at` 是同一件事的两面（是不是 / 什么时候），**只在这里一起写**；
 * 因为老库已经有 `pinned`、界面与查询也都在用它，本版不做删列迁移。
 *
 * **不碰 `updated_at`**：否则「更新时间」会变成谎话，
 * 取消置顶后便签还会莫名其妙跳到最前（《功能/便签》已知的坑）。
 */
export function setNotePinned(
  db: Db,
  userId: number,
  noteId: number,
  pinned: boolean,
  now = Date.now(),
): boolean {
  const result = pinned
    ? db
        .prepare(
          "UPDATE sticky_notes SET pinned = 1, pinned_at = ? WHERE id = ? AND user_id = ?",
        )
        .run(now, noteId, userId)
    : db
        .prepare(
          "UPDATE sticky_notes SET pinned = 0, pinned_at = NULL WHERE id = ? AND user_id = ?",
        )
        .run(noteId, userId);
  return result.changes > 0;
}

/** 删除一张便签（没有软删除、没有回收站）。返回是否命中。 */
export function deleteNote(
  db: Db,
  userId: number,
  noteId: number,
): boolean {
  const result = db
    .prepare("DELETE FROM sticky_notes WHERE id = ? AND user_id = ?")
    .run(noteId, userId);
  return result.changes > 0;
}

import type { Db } from "@/lib/auth/db";

/**
 * 待办的数据访问（《数据库/待办表》《功能/待办清单》§三）。
 *
 * 分工：这里只碰数据库，不碰 cookie 与请求上下文；服务端操作在 `actions.ts`。
 * 所有查询都带 `user_id = ?`——归属从第一天就生效，不是「反正只有一个用户」的自觉。
 *
 * **完成状态只由 `completed_at` 表达**：NULL = 没做完，有值 = 做完的时刻。
 * 没有 `done` 布尔，就不会出现「已完成却没有完成时间」这种自相矛盾的行。
 */

/** 对外的待办表示（camelCase）。库里的行是 snake_case，转换只在 `toTodo` 一处发生。 */
export interface Todo {
  id: number;
  title: string;
  /** 完成时刻（毫秒）；`null` = 还没做完。 */
  completedAt: number | null;
  createdAt: number;
}

/**
 * 一个人当前的整块待办板。
 *
 * 首页卡与工具页共用同一次查询：排序与计数只写在 `listTodos` 一处，
 * 两处各写一条 SQL，顺序迟早会不一致。
 */
export interface TodoBoard {
  /** 未完成：创建时间倒序（新加的在上）。 */
  open: Todo[];
  /** 已完成：完成时间倒序（最近做完的在上）。 */
  completed: Todo[];
  /** 全部条数（含已完成）。 */
  total: number;
  /** 已完成条数。 */
  done: number;
}

/** 数据库里的行。 */
interface TodoRow {
  id: number;
  title: string;
  completed_at: number | null;
  created_at: number;
}

const SELECT_COLUMNS = "id, title, completed_at, created_at";

function toTodo(row: TodoRow): Todo {
  return {
    id: row.id,
    title: row.title,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

/**
 * 读整块待办板：未完成一段、已完成一段、以及全局计数。
 *
 * - 未完成 `ORDER BY created_at DESC, id DESC`：刚想到的事立刻看见；
 * - 已完成 `ORDER BY completed_at DESC, id DESC`：最近做完的在上；
 * - 末尾 `id DESC` 是稳定排序的兜底——毫秒时间戳会撞车，SQL 不保证等值行的顺序。
 *
 * `openLimit` 只截「未完成」那一段（首页卡取 3 条），不影响已完成与计数：
 * 首页的 `1/3` 读作「全部 3 条里做完 1 条」，与卡里显示几条无关。
 */
export function listTodos(
  db: Db,
  userId: number,
  openLimit?: number,
): TodoBoard {
  const openSql = `SELECT ${SELECT_COLUMNS} FROM todos
     WHERE user_id = ? AND completed_at IS NULL
     ORDER BY created_at DESC, id DESC`;

  const open =
    openLimit === undefined
      ? (db.prepare(openSql).all(userId) as TodoRow[])
      : (db.prepare(`${openSql} LIMIT ?`).all(userId, openLimit) as TodoRow[]);

  const completed = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM todos
       WHERE user_id = ? AND completed_at IS NOT NULL
       ORDER BY completed_at DESC, id DESC`,
    )
    .all(userId) as TodoRow[];

  // count(completed_at) 只数非 NULL 的行——「只存 completed_at」顺手带来的好处
  const counts = db
    .prepare(
      "SELECT count(*) AS total, count(completed_at) AS done FROM todos WHERE user_id = ?",
    )
    .get(userId) as { total: number; done: number };

  return {
    open: open.map(toTodo),
    completed: completed.map(toTodo),
    total: counts.total,
    done: counts.done,
  };
}

/** 新建一条待办（`completed_at` 留 NULL = 没做完）。 */
export function createTodo(
  db: Db,
  userId: number,
  title: string,
  now = Date.now(),
): Todo {
  const result = db
    .prepare(
      "INSERT INTO todos (user_id, title, completed_at, created_at) VALUES (?, ?, NULL, ?)",
    )
    .run(userId, title, now);

  return {
    id: Number(result.lastInsertRowid),
    title,
    completedAt: null,
    createdAt: now,
  };
}

/**
 * 改标题。
 *
 * 返回是否命中：待办不存在、或不属于该用户时 `changes` 为 0——
 * 归属校验就落在这条 `AND user_id = ?` 上，调用方据此判失败。
 *
 * **不碰 `created_at`**：创建时间是既成事实，改标题不该把它抹掉；
 * 本版也不存 `updated_at`——界面上没有「最后修改时间」这个位置。
 */
export function updateTodoTitle(
  db: Db,
  userId: number,
  todoId: number,
  title: string,
): boolean {
  const result = db
    .prepare("UPDATE todos SET title = ? WHERE id = ? AND user_id = ?")
    .run(title, todoId, userId);
  return result.changes > 0;
}

/**
 * 勾选 / 取消勾选：写一个时间戳，或写回 NULL。
 *
 * 不加「当前状态必须相反」的条件：勾选与取消是同一件事的正反面，
 * 重复调用应当无害（双击、重试都不该报「待办不存在」）。
 * 命中与否只看这一行属不属于该用户——归属校验落在这条 `AND user_id = ?` 上。
 */
export function setTodoCompleted(
  db: Db,
  userId: number,
  todoId: number,
  completed: boolean,
  now = Date.now(),
): boolean {
  const result = completed
    ? db
        .prepare(
          "UPDATE todos SET completed_at = ? WHERE id = ? AND user_id = ?",
        )
        .run(now, todoId, userId)
    : db
        .prepare(
          "UPDATE todos SET completed_at = NULL WHERE id = ? AND user_id = ?",
        )
        .run(todoId, userId);
  return result.changes > 0;
}

/** 删除一条待办（没有软删除、没有回收站）。返回是否命中。 */
export function deleteTodo(
  db: Db,
  userId: number,
  todoId: number,
): boolean {
  const result = db
    .prepare("DELETE FROM todos WHERE id = ? AND user_id = ?")
    .run(todoId, userId);
  return result.changes > 0;
}

/**
 * 清除已完成：只删 `completed_at IS NOT NULL` 的行。
 *
 * 未完成的 `completed_at` 是 NULL，条件不成立，一条都不会被带走。
 * 返回实际删掉的行数。
 */
export function clearCompletedTodos(db: Db, userId: number): number {
  const result = db
    .prepare("DELETE FROM todos WHERE user_id = ? AND completed_at IS NOT NULL")
    .run(userId);
  return result.changes;
}

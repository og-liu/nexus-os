"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import {
  clearCompletedTodos,
  createTodo,
  deleteTodo,
  listTodos,
  setTodoCompleted,
  updateTodoTitle,
  type TodoBoard,
} from "./todos";
import { validateTodoTitle } from "./validate";

/**
 * 待办的 Server Actions（《功能/待办清单》）。
 *
 * 两个必须记住的前提：
 * 1. Server Action 是**公开 HTTP 端点**：标题校验与归属校验必须在服务端再做一遍，
 *    浏览器里的提示不是防线；
 * 2. 每个 action 第一件事是 `requireUser()`——它同时完成「登录检查」与「取当前用户」，
 *    后续每条 SQL 的 `user_id` 都来自它。
 *
 * 写操作统一返回**整块待办板**：排序与计数只有服务端一份，客户端直接 setState。
 * 「勾选」不立刻套用返回的列表：先本地变灰划线，留一拍再离场，离场后才用这块板
 * 补位（工具页移动卡片、首页卡补上第 4 条）——见 todo-list-view / todo-card。
 */

export type TodosActionResult =
  | { ok: true; board: TodoBoard }
  | { ok: false; error: string };

/** 写成功后的统一回执：重新查一遍待办板（排序规则只活在 SQL 里）。 */
function ok(board: TodoBoard): TodosActionResult {
  return { ok: true, board };
}

function fail(error: string): TodosActionResult {
  return { ok: false, error };
}

/** 首页卡与工具页都依赖同一份数据，写完一起失效。 */
function revalidateTodos(): void {
  revalidatePath("/tools/todo-list");
  revalidatePath("/");
}

/**
 * 非法 id 直接挡掉。
 *
 * 类型只在编译期存在；这个函数可以被直接 POST 调用，收到 `"1"` 或 `null` 时
 * 不该把参数原样塞进 SQL 等数据库报错。
 */
function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function createTodoAction(
  rawTitle: string,
): Promise<TodosActionResult> {
  const user = await requireUser();
  // 类型只在编译期存在；这个函数可以被直接 POST 调用，收到非字符串时不该让 `trim()` 抛出去
  if (typeof rawTitle !== "string") return fail("待办内容不能为空");

  const parsed = validateTodoTitle(rawTitle);
  if (!parsed.ok) return fail(parsed.error);

  const db = getDb();
  createTodo(db, user.id, parsed.title);
  revalidateTodos();
  return ok(listTodos(db, user.id));
}

export async function updateTodoAction(
  todoId: number,
  rawTitle: string,
): Promise<TodosActionResult> {
  const user = await requireUser();
  if (!isValidId(todoId)) return fail("待办不存在");
  if (typeof rawTitle !== "string") return fail("待办内容不能为空");

  const parsed = validateTodoTitle(rawTitle);
  if (!parsed.ok) return fail(parsed.error);

  const db = getDb();
  if (!updateTodoTitle(db, user.id, todoId, parsed.title)) {
    return fail("待办不存在");
  }
  revalidateTodos();
  return ok(listTodos(db, user.id));
}

export async function toggleTodoAction(
  todoId: number,
  completed: boolean,
): Promise<TodosActionResult> {
  const user = await requireUser();
  if (!isValidId(todoId)) return fail("待办不存在");

  const db = getDb();
  if (!setTodoCompleted(db, user.id, todoId, completed)) {
    return fail("待办不存在");
  }
  revalidateTodos();
  return ok(listTodos(db, user.id));
}

export async function deleteTodoAction(
  todoId: number,
): Promise<TodosActionResult> {
  const user = await requireUser();
  if (!isValidId(todoId)) return fail("待办不存在");

  const db = getDb();
  if (!deleteTodo(db, user.id, todoId)) {
    return fail("待办不存在");
  }
  revalidateTodos();
  return ok(listTodos(db, user.id));
}

export async function clearCompletedTodosAction(): Promise<TodosActionResult> {
  const user = await requireUser();
  const db = getDb();
  clearCompletedTodos(db, user.id);
  revalidateTodos();
  return ok(listTodos(db, user.id));
}

import { describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import { createUser } from "@/lib/auth/user";
import {
  clearCompletedTodos,
  createTodo,
  deleteTodo,
  listTodos,
  setTodoCompleted,
  updateTodoTitle,
  type Todo,
} from "./todos";

/** 内存库 + 两个用户：归属隔离的用例需要「另外一个人」。 */
function setup() {
  const db = createConnection(":memory:");
  return {
    db,
    alice: createTestUser(db, "alice"),
    bob: createTestUser(db, "bob"),
  };
}

function createTestUser(db: Db, username: string) {
  const user = createUser(db, {
    username,
    usernameKey: username,
    passwordHash: "hash",
  });
  if (!user) throw new Error("测试用户创建失败");
  return user;
}

function titles(todos: Todo[]): string[] {
  return todos.map((todo) => todo.title);
}

describe("待办数据访问", () => {
  it("未完成排序：创建时间倒序，同一毫秒按 id 倒序兜底", () => {
    const { db, alice } = setup();
    const first = createTodo(db, alice.id, "先加的", 1_000);
    const second = createTodo(db, alice.id, "后加的", 2_000);

    expect(titles(listTodos(db, alice.id).open)).toEqual(["后加的", "先加的"]);

    // 同一毫秒：先建的 id 更小，应排在后面
    const sameMsA = createTodo(db, alice.id, "同毫秒 A", 3_000);
    const sameMsB = createTodo(db, alice.id, "同毫秒 B", 3_000);

    expect(listTodos(db, alice.id).open.map((todo) => todo.id)).toEqual([
      sameMsB.id,
      sameMsA.id,
      second.id,
      first.id,
    ]);
  });

  it("已完成排序：完成时间倒序，最早做完的排最后", () => {
    const { db, alice } = setup();
    const early = createTodo(db, alice.id, "早做完", 1_000);
    const late = createTodo(db, alice.id, "晚做完", 2_000);

    setTodoCompleted(db, alice.id, early.id, true, 10_000);
    setTodoCompleted(db, alice.id, late.id, true, 20_000);

    expect(titles(listTodos(db, alice.id).completed)).toEqual([
      "晚做完",
      "早做完",
    ]);
    expect(listTodos(db, alice.id).open).toEqual([]);
  });

  it("勾选写入 completed_at，取消勾选置回 NULL 并回到未完成的原位置", () => {
    const { db, alice } = setup();
    const first = createTodo(db, alice.id, "A", 1_000);
    const second = createTodo(db, alice.id, "B", 2_000);
    const third = createTodo(db, alice.id, "C", 3_000);

    expect(setTodoCompleted(db, alice.id, first.id, true, 5_000)).toBe(true);
    let board = listTodos(db, alice.id);
    expect(board.done).toBe(1);
    expect(board.total).toBe(3);
    expect(board.completed[0]).toMatchObject({
      id: first.id,
      completedAt: 5_000,
    });

    expect(setTodoCompleted(db, alice.id, first.id, false)).toBe(true);
    board = listTodos(db, alice.id);
    expect(board.done).toBe(0);
    // 「A」按创建时间回到它该在的位置（最后），不是跑到最前
    expect(board.open.map((todo) => todo.id)).toEqual([
      third.id,
      second.id,
      first.id,
    ]);
    expect(board.open.at(-1)?.completedAt).toBeNull();
    expect(board.completed).toEqual([]);
  });

  it("计数是全局的：openLimit 只截未完成列表，不动计数与已完成", () => {
    const { db, alice } = setup();
    for (let index = 0; index < 5; index += 1) {
      createTodo(db, alice.id, `todo-${index}`, 1_000 + index);
    }
    const oldest = listTodos(db, alice.id).open.at(-1);
    if (!oldest) throw new Error("待办为空");
    setTodoCompleted(db, alice.id, oldest.id, true, 9_000);

    const board = listTodos(db, alice.id, 3);

    expect(board.open).toHaveLength(3);
    expect(board.total).toBe(5);
    expect(board.done).toBe(1);
    expect(board.completed).toHaveLength(1);
  });

  it("改标题：只动 title，创建时间与完成状态都不变", () => {
    const { db, alice } = setup();
    const todo = createTodo(db, alice.id, "买牛奶", 1_000);

    expect(updateTodoTitle(db, alice.id, todo.id, "买两盒牛奶")).toBe(true);

    const updated = listTodos(db, alice.id).open[0];
    expect(updated).toMatchObject({
      id: todo.id,
      title: "买两盒牛奶",
      createdAt: 1_000,
      completedAt: null,
    });

    // 已完成的行也能改，且不会被顺手取消完成
    setTodoCompleted(db, alice.id, todo.id, true, 5_000);
    expect(updateTodoTitle(db, alice.id, todo.id, "买三盒牛奶")).toBe(true);
    expect(listTodos(db, alice.id).completed[0]).toMatchObject({
      title: "买三盒牛奶",
      completedAt: 5_000,
      createdAt: 1_000,
    });
  });

  it("改标题不存在的 id 返回 false，也不影响别人的行", () => {
    const { db, alice, bob } = setup();
    const todo = createTodo(db, alice.id, "A", 1_000);

    expect(updateTodoTitle(db, bob.id, todo.id, "hacked")).toBe(false);
    expect(updateTodoTitle(db, alice.id, 9_999, "hacked")).toBe(false);
    expect(listTodos(db, alice.id).open[0]).toMatchObject({
      title: "A",
      createdAt: 1_000,
    });
  });

  it("user_id 隔离：别人的待办勾不动、删不掉、也看不到", () => {
    const { db, alice, bob } = setup();
    const todo = createTodo(db, alice.id, "A", 1_000);

    expect(setTodoCompleted(db, bob.id, todo.id, true, 5_000)).toBe(false);
    expect(deleteTodo(db, bob.id, todo.id)).toBe(false);
    expect(clearCompletedTodos(db, bob.id)).toBe(0);

    expect(listTodos(db, bob.id)).toEqual({
      open: [],
      completed: [],
      total: 0,
      done: 0,
    });
    expect(listTodos(db, alice.id).open[0]).toMatchObject({
      id: todo.id,
      title: "A",
      completedAt: null,
    });
  });

  it("清除已完成只删已完成的，返回删掉的行数", () => {
    const { db, alice } = setup();
    const doneA = createTodo(db, alice.id, "做完 A", 1_000);
    const doneB = createTodo(db, alice.id, "做完 B", 2_000);
    const open = createTodo(db, alice.id, "没做完", 3_000);
    setTodoCompleted(db, alice.id, doneA.id, true, 5_000);
    setTodoCompleted(db, alice.id, doneB.id, true, 6_000);

    expect(clearCompletedTodos(db, alice.id)).toBe(2);

    const board = listTodos(db, alice.id);
    expect(board.completed).toEqual([]);
    expect(board.open.map((todo) => todo.id)).toEqual([open.id]);
    expect(board.total).toBe(1);
    expect(board.done).toBe(0);
  });

  it("删除命中返回 true，再次删除返回 false", () => {
    const { db, alice } = setup();
    const todo = createTodo(db, alice.id, "A");

    expect(deleteTodo(db, alice.id, todo.id)).toBe(true);
    expect(deleteTodo(db, alice.id, todo.id)).toBe(false);
  });

  it("勾选 / 删除不存在的 id 返回 false，不抛异常", () => {
    const { db, alice } = setup();

    expect(setTodoCompleted(db, alice.id, 9_999, true)).toBe(false);
    expect(deleteTodo(db, alice.id, 9_999)).toBe(false);
    expect(listTodos(db, alice.id).total).toBe(0);
  });
});

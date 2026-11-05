import { describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import { createUser } from "@/lib/auth/user";
import {
  createNote,
  deleteNote,
  listNotes,
  setNotePinned,
  updateNoteBody,
} from "./notes";

/** 内存库 + 两个用户：归属隔离的用例需要「另外一个人」。 */
function setup() {
  const db = createConnection(":memory:");
  return { db, alice: createTestUser(db, "alice"), bob: createTestUser(db, "bob") };
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

describe("便签数据访问", () => {
  it("排序：置顶优先 → 置顶时间倒序 → 更新时间倒序 → id 兜底", () => {
    const { db, alice } = setup();
    const first = createNote(db, alice.id, "A", 1_000);
    createNote(db, alice.id, "B", 2_000);
    createNote(db, alice.id, "C", 3_000);

    expect(listNotes(db, alice.id).map((note) => note.body)).toEqual([
      "C",
      "B",
      "A",
    ]);

    setNotePinned(db, alice.id, first.id, true);
    expect(listNotes(db, alice.id).map((note) => note.body)).toEqual([
      "A",
      "C",
      "B",
    ]);

    setNotePinned(db, alice.id, first.id, false);
    expect(listNotes(db, alice.id).map((note) => note.body)).toEqual([
      "C",
      "B",
      "A",
    ]);
  });

  it("置顶组内按置顶时间倒序：后置顶的排最前，与更新时间无关", () => {
    const { db, alice } = setup();
    const newestUpdated = createNote(db, alice.id, "更新时间最新", 9_000);
    const oldestUpdated = createNote(db, alice.id, "更新时间最旧", 1_000);
    createNote(db, alice.id, "未置顶但更新最新", 50_000);

    // 先置顶更新最旧的，再置顶更新最新的：后者在前
    setNotePinned(db, alice.id, oldestUpdated.id, true, 10_000);
    setNotePinned(db, alice.id, newestUpdated.id, true, 20_000);
    expect(listNotes(db, alice.id).map((note) => note.body)).toEqual([
      "更新时间最新",
      "更新时间最旧",
      "未置顶但更新最新",
    ]);

    // 一条「更新时间很旧」的便签刚被置顶：它跳到所有置顶的第一条
    const justPinned = createNote(db, alice.id, "刚置顶的老便签", 500);
    setNotePinned(db, alice.id, justPinned.id, true, 30_000);
    expect(listNotes(db, alice.id).map((note) => note.body)).toEqual([
      "刚置顶的老便签",
      "更新时间最新",
      "更新时间最旧",
      "未置顶但更新最新",
    ]);

    // 取消置顶：回到未置顶组，按更新时间该在哪就在哪
    setNotePinned(db, alice.id, oldestUpdated.id, false, 40_000);
    expect(listNotes(db, alice.id).map((note) => note.body)).toEqual([
      "刚置顶的老便签",
      "更新时间最新",
      "未置顶但更新最新",
      "更新时间最旧",
    ]);

    // 再置顶一次：按新的置顶时刻排到最前
    setNotePinned(db, alice.id, oldestUpdated.id, true, 60_000);
    expect(listNotes(db, alice.id).map((note) => note.body)).toEqual([
      "更新时间最旧",
      "刚置顶的老便签",
      "更新时间最新",
      "未置顶但更新最新",
    ]);
  });

  it("同一毫秒的多条便签按 id 倒序，顺序稳定", () => {
    const { db, alice } = setup();
    const first = createNote(db, alice.id, "first", 5_000);
    const second = createNote(db, alice.id, "second", 5_000);

    expect(listNotes(db, alice.id).map((note) => note.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("置顶不刷新 updated_at", () => {
    const { db, alice } = setup();
    const note = createNote(db, alice.id, "A", 1_000);

    setNotePinned(db, alice.id, note.id, true);

    expect(listNotes(db, alice.id)[0]).toMatchObject({
      id: note.id,
      pinned: true,
      updatedAt: 1_000,
    });
  });

  it("改正文会刷新 updated_at 并重新参与排序", () => {
    const { db, alice } = setup();
    createNote(db, alice.id, "A", 1_000);
    const second = createNote(db, alice.id, "B", 2_000);

    updateNoteBody(db, alice.id, second.id, "B 改过了", 3_000);

    expect(listNotes(db, alice.id)[0]).toMatchObject({
      id: second.id,
      body: "B 改过了",
      updatedAt: 3_000,
    });
  });

  it("user_id 隔离：别人的便签改不动、删不掉、也看不到", () => {
    const { db, alice, bob } = setup();
    const note = createNote(db, alice.id, "A", 1_000);

    expect(updateNoteBody(db, bob.id, note.id, "hacked")).toBe(false);
    expect(setNotePinned(db, bob.id, note.id, true)).toBe(false);
    expect(deleteNote(db, bob.id, note.id)).toBe(false);

    expect(listNotes(db, bob.id)).toEqual([]);
    expect(listNotes(db, alice.id)[0]).toMatchObject({
      id: note.id,
      body: "A",
      pinned: false,
    });
  });

  it("limit 只截条数，不改变排序", () => {
    const { db, alice } = setup();
    for (let index = 0; index < 5; index += 1) {
      createNote(db, alice.id, `note-${index}`, 1_000 + index);
    }

    expect(listNotes(db, alice.id, 3).map((note) => note.body)).toEqual([
      "note-4",
      "note-3",
      "note-2",
    ]);
  });

  it("删除命中返回 true，再次删除返回 false", () => {
    const { db, alice } = setup();
    const note = createNote(db, alice.id, "A");

    expect(deleteNote(db, alice.id, note.id)).toBe(true);
    expect(deleteNote(db, alice.id, note.id)).toBe(false);
  });
});

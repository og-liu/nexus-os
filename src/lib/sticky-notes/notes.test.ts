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
  it("排序：置顶优先 → 更新时间倒序 → id 兜底", () => {
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

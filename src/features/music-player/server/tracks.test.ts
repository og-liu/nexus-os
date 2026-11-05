import { beforeEach, describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import {
  createTrack,
  deleteTrack,
  deleteTracks,
  findTrack,
  listTracks,
  reorderTracks,
  usedBytes,
  type NewTrack,
} from "./tracks";

const SAMPLE: NewTrack = {
  title: "晴天",
  artist: "周杰伦",
  fileName: "11111111-1111-1111-1111-111111111111.mp3",
  codec: "mp3",
  sizeBytes: 1024,
  durationMs: 269_000,
};

describe("music-player/tracks（features/music-player/README.md §三）", () => {
  let db: Db;
  let alice: number;
  let bob: number;

  beforeEach(() => {
    db = createConnection(":memory:");
    alice = Number(
      db
        .prepare(
          "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("Alice", "alice", "x", 1).lastInsertRowid,
    );
    bob = Number(
      db
        .prepare(
          "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
        )
        .run("Bob", "bob", "x", 1).lastInsertRowid,
    );
  });

  it("新建后能读回来，字段一一对应", () => {
    const track = createTrack(db, alice, SAMPLE, 1000);

    expect(track.id).toBeGreaterThan(0);
    expect(findTrack(db, alice, track.id)).toEqual(track);
    expect(track.title).toBe("晴天");
    expect(track.artist).toBe("周杰伦");
    expect(track.durationMs).toBe(269_000);
  });

  it("列表按上传顺序正序：整张专辑传进来就按专辑顺序播", () => {
    createTrack(db, alice, { ...SAMPLE, title: "第一首" }, 1000);
    createTrack(db, alice, { ...SAMPLE, title: "第二首" }, 2000);
    createTrack(db, alice, { ...SAMPLE, title: "第三首" }, 3000);

    expect(listTracks(db, alice).tracks.map((t) => t.title)).toEqual([
      "第一首",
      "第二首",
      "第三首",
    ]);
  });

  it("同一毫秒上传的多首按 id 兜底，顺序稳定", () => {
    createTrack(db, alice, { ...SAMPLE, title: "A" }, 5000);
    createTrack(db, alice, { ...SAMPLE, title: "B" }, 5000);
    createTrack(db, alice, { ...SAMPLE, title: "C" }, 5000);

    expect(listTracks(db, alice).tracks.map((t) => t.title)).toEqual(["A", "B", "C"]);
  });

  it("合计体积是全部曲目之和，空库为 0", () => {
    expect(usedBytes(db, alice)).toBe(0);
    createTrack(db, alice, { ...SAMPLE, sizeBytes: 1000 }, 1);
    createTrack(db, alice, { ...SAMPLE, sizeBytes: 2500 }, 2);
    expect(usedBytes(db, alice)).toBe(3500);
    expect(listTracks(db, alice).totalBytes).toBe(3500);
  });

  it("歌名可以重复，不建唯一约束（两首歌同名是常事）", () => {
    createTrack(db, alice, SAMPLE, 1);
    expect(() => createTrack(db, alice, SAMPLE, 2)).not.toThrow();
    expect(listTracks(db, alice).tracks).toHaveLength(2);
  });

  it("看不到、也取不到别人的歌", () => {
    const mine = createTrack(db, alice, SAMPLE, 1);
    expect(listTracks(db, bob).tracks).toHaveLength(0);
    expect(listTracks(db, bob).totalBytes).toBe(0);
    expect(findTrack(db, bob, mine.id)).toBeNull();
  });

  it("删自己的歌返回被删的行（拿 fileName 去删文件）", () => {
    const mine = createTrack(db, alice, SAMPLE, 1);
    expect(deleteTrack(db, alice, mine.id)).toEqual(mine);
    expect(findTrack(db, alice, mine.id)).toBeNull();
  });

  it("删别人的歌返回 null 且不删", () => {
    const mine = createTrack(db, alice, SAMPLE, 1);
    expect(deleteTrack(db, bob, mine.id)).toBeNull();
    expect(findTrack(db, alice, mine.id)).not.toBeNull();
  });

  it("删不存在的 id 返回 null，不抛异常", () => {
    expect(deleteTrack(db, alice, 9999)).toBeNull();
  });

  it("批量删：一次删多首，返回被删的那些行", () => {
    const a = createTrack(db, alice, { ...SAMPLE, title: "A" }, 1);
    createTrack(db, alice, { ...SAMPLE, title: "B" }, 2);
    const c = createTrack(db, alice, { ...SAMPLE, title: "C" }, 3);

    const removed = deleteTracks(db, alice, [a.id, c.id]);

    expect(removed.map((track) => track.title).sort()).toEqual(["A", "C"]);
    expect(listTracks(db, alice).tracks.map((track) => track.title)).toEqual(["B"]);
  });

  it("批量删只删自己的：混进别人的 id 会被忽略", () => {
    const mine = createTrack(db, alice, SAMPLE, 1);
    const theirs = createTrack(db, bob, SAMPLE, 2);

    const removed = deleteTracks(db, alice, [mine.id, theirs.id]);

    expect(removed.map((track) => track.id)).toEqual([mine.id]);
    expect(findTrack(db, bob, theirs.id)).not.toBeNull();
  });

  it("批量删会去重，并过滤掉 0 / 负数 / 小数这些非法 id", () => {
    const a = createTrack(db, alice, SAMPLE, 1);
    const removed = deleteTracks(db, alice, [a.id, a.id, 0, -1, 1.5]);

    expect(removed).toHaveLength(1);
    expect(findTrack(db, alice, a.id)).toBeNull();
  });

  it("新歌排在末尾（position 递增）", () => {
    const a = createTrack(db, alice, { ...SAMPLE, title: "A" }, 1);
    const b = createTrack(db, alice, { ...SAMPLE, title: "B" }, 2);
    const c = createTrack(db, alice, { ...SAMPLE, title: "C" }, 3);

    expect(listTracks(db, alice).tracks.map((track) => track.id)).toEqual([a.id, b.id, c.id]);
  });

  it("重排后列表顺序按新顺序来", () => {
    const a = createTrack(db, alice, { ...SAMPLE, title: "A" }, 1);
    const b = createTrack(db, alice, { ...SAMPLE, title: "B" }, 2);
    const c = createTrack(db, alice, { ...SAMPLE, title: "C" }, 3);

    expect(reorderTracks(db, alice, [c.id, a.id, b.id])).toBe(true);
    expect(listTracks(db, alice).tracks.map((track) => track.title)).toEqual(["C", "A", "B"]);
  });

  it("重排只认自己的歌：混进别人的 id 会被丢掉，对方的顺序不动", () => {
    const mine = createTrack(db, alice, { ...SAMPLE, title: "Mine" }, 1);
    const theirs1 = createTrack(db, bob, { ...SAMPLE, title: "B1" }, 1);
    const theirs2 = createTrack(db, bob, { ...SAMPLE, title: "B2" }, 2);

    expect(reorderTracks(db, alice, [theirs1.id, mine.id])).toBe(true);

    expect(listTracks(db, alice).tracks.map((t) => t.title)).toEqual(["Mine"]);
    expect(listTracks(db, bob).tracks.map((t) => t.id)).toEqual([theirs1.id, theirs2.id]);
  });

  it("重排空数组返回 false，顺序不变", () => {
    const a = createTrack(db, alice, SAMPLE, 1);
    expect(reorderTracks(db, alice, [])).toBe(false);
    expect(listTracks(db, alice).tracks.map((t) => t.id)).toEqual([a.id]);
  });

  it("重排不影响曲目本身的字段", () => {
    const a = createTrack(db, alice, { ...SAMPLE, title: "A" }, 1);
    reorderTracks(db, alice, [a.id]);
    const [first] = listTracks(db, alice).tracks;
    expect(first).toMatchObject({ id: a.id, title: "A", artist: "周杰伦", codec: "mp3" });
  });

  it("批量删空数组或全不存在的 id 时返回空数组，不抛异常", () => {
    expect(deleteTracks(db, alice, [])).toEqual([]);
    expect(deleteTracks(db, alice, [9999, 8888])).toEqual([]);
  });

  it("删账号时曲目行级联删除（外键真的开着）", () => {
    createTrack(db, alice, SAMPLE, 1);
    db.prepare("DELETE FROM users WHERE id = ?").run(alice);
    expect(listTracks(db, alice).tracks).toHaveLength(0);
  });

  it("user_id 指向不存在的账号时插不进去（外键兜底）", () => {
    expect(() => createTrack(db, 999_999, SAMPLE, 1)).toThrow();
  });
});

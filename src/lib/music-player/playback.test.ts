import { beforeEach, describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import { readPlaybackState, resolvePlaybackState, savePlaybackState } from "./playback";
import { createPlaylist } from "./playlists";
import { createTrack, type NewTrack } from "./tracks";

const SAMPLE: NewTrack = {
  title: "晴天",
  artist: "周杰伦",
  fileName: "11111111-1111-1111-1111-111111111111.mp3",
  codec: "mp3",
  sizeBytes: 1024,
  durationMs: 269_000,
};

describe("music-player/playback（《功能/音乐播放器》§2.1.6）", () => {
  let db: Db;
  let alice: number;
  let bob: number;

  beforeEach(() => {
    db = createConnection(":memory:");
    const insertUser = db.prepare(
      "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
    );
    alice = Number(insertUser.run("Alice", "alice", "x", 1).lastInsertRowid);
    bob = Number(insertUser.run("Bob", "bob", "x", 1).lastInsertRowid);
  });

  it("从来没播过：读回 null", () => {
    expect(readPlaybackState(db, alice)).toBeNull();
  });

  it("保存后能读回来", () => {
    const track = createTrack(db, alice, SAMPLE, 1);
    const playlist = createPlaylist(db, alice, "通勤", 2);

    savePlaybackState(
      db,
      alice,
      { trackId: track.id, playlistId: playlist.id, positionMs: 45_300 },
      1_000,
    );

    expect(readPlaybackState(db, alice)).toEqual({
      trackId: track.id,
      playlistId: playlist.id,
      positionMs: 45_300,
      updatedAt: 1_000,
    });
  });

  it("再保存一次是覆盖，不是插第二行", () => {
    const a = createTrack(db, alice, { ...SAMPLE, title: "A" }, 1);
    const b = createTrack(db, alice, { ...SAMPLE, title: "B" }, 2);

    savePlaybackState(db, alice, { trackId: a.id, playlistId: null, positionMs: 1_000 });
    savePlaybackState(db, alice, { trackId: b.id, playlistId: null, positionMs: 2_000 });

    expect(readPlaybackState(db, alice)).toMatchObject({ trackId: b.id, positionMs: 2_000 });
    const rows = db.prepare("SELECT count(*) AS n FROM music_playback").get() as { n: number };
    expect(rows.n).toBe(1);
  });

  it("两个人各存各的", () => {
    const mine = createTrack(db, alice, SAMPLE, 1);
    const theirs = createTrack(db, bob, { ...SAMPLE, title: "Bob 的" }, 1);

    savePlaybackState(db, alice, { trackId: mine.id, playlistId: null, positionMs: 10 });
    savePlaybackState(db, bob, { trackId: theirs.id, playlistId: null, positionMs: 20 });

    expect(readPlaybackState(db, alice)?.positionMs).toBe(10);
    expect(readPlaybackState(db, bob)?.positionMs).toBe(20);
  });

  it("负数 / NaN / Infinity 都被夹成 0", () => {
    const track = createTrack(db, alice, SAMPLE, 1);

    for (const bad of [-500, Number.NaN, Number.POSITIVE_INFINITY]) {
      savePlaybackState(db, alice, { trackId: track.id, playlistId: null, positionMs: bad });
      expect(readPlaybackState(db, alice)?.positionMs).toBe(0);
    }
  });

  it("非正整数的 id 一律存成 null", () => {
    savePlaybackState(db, alice, { trackId: 0, playlistId: -3, positionMs: 100 });
    expect(readPlaybackState(db, alice)).toMatchObject({ trackId: null, playlistId: null });
  });

  describe("resolvePlaybackState：把进度对齐到还在的东西上", () => {
    it("歌还在、歌单还在：原样返回", () => {
      const track = createTrack(db, alice, SAMPLE, 1);
      const playlist = createPlaylist(db, alice, "通勤", 2);
      savePlaybackState(db, alice, { trackId: track.id, playlistId: playlist.id, positionMs: 900 });

      const state = resolvePlaybackState(db, alice, readPlaybackState(db, alice));
      expect(state).toMatchObject({ trackId: track.id, playlistId: playlist.id, positionMs: 900 });
    });

    it("歌单被删了：退回全库，歌和进度还留着", () => {
      const track = createTrack(db, alice, SAMPLE, 1);
      const playlist = createPlaylist(db, alice, "通勤", 2);
      savePlaybackState(db, alice, { trackId: track.id, playlistId: playlist.id, positionMs: 900 });
      db.prepare("DELETE FROM playlists WHERE id = ?").run(playlist.id);

      const state = resolvePlaybackState(db, alice, readPlaybackState(db, alice));
      expect(state).toMatchObject({ trackId: track.id, playlistId: null, positionMs: 900 });
    });

    it("歌被删了：整条作废", () => {
      const track = createTrack(db, alice, SAMPLE, 1);
      savePlaybackState(db, alice, { trackId: track.id, playlistId: null, positionMs: 900 });
      db.prepare("DELETE FROM music_tracks WHERE id = ?").run(track.id);

      expect(resolvePlaybackState(db, alice, readPlaybackState(db, alice))).toBeNull();
    });

    it("别人的歌 id 塞进来：当作不存在", () => {
      const theirs = createTrack(db, bob, SAMPLE, 1);
      savePlaybackState(db, alice, { trackId: theirs.id, playlistId: null, positionMs: 900 });

      expect(resolvePlaybackState(db, alice, readPlaybackState(db, alice))).toBeNull();
    });

    it("之前是 null：直接返回 null", () => {
      expect(resolvePlaybackState(db, alice, null)).toBeNull();
    });
  });

  it("删账号时这行也跟着消失", () => {
    const track = createTrack(db, alice, SAMPLE, 1);
    savePlaybackState(db, alice, { trackId: track.id, playlistId: null, positionMs: 500 });

    db.prepare("DELETE FROM users WHERE id = ?").run(alice);

    const rows = db.prepare("SELECT count(*) AS n FROM music_playback").get() as { n: number };
    expect(rows.n).toBe(0);
  });
});

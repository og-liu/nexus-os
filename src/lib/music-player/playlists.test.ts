import { beforeEach, describe, expect, it } from "vitest";
import { createConnection, type Db } from "@/lib/auth/db";
import {
  addTracksToPlaylist,
  cleanPlaylistName,
  createPlaylist,
  deletePlaylist,
  findPlaylist,
  listPlaylists,
  PlaylistNameTakenError,
  playlistTrackIds,
  removeTrackFromPlaylist,
  renamePlaylist,
  reorderPlaylistTracks,
} from "./playlists";
import { createTrack, findTrack, listTracks, setTrackPlaylists, type NewTrack } from "./tracks";

const SAMPLE: NewTrack = {
  title: "晴天",
  artist: "周杰伦",
  fileName: "11111111-1111-1111-1111-111111111111.mp3",
  codec: "mp3",
  sizeBytes: 1024,
  durationMs: 269_000,
};

describe("music-player/playlists（《数据库/音乐歌单表》）", () => {
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

  const track = (userId: number, title: string, createdAt = 1) =>
    createTrack(db, userId, { ...SAMPLE, title }, createdAt);

  describe("cleanPlaylistName", () => {
    it("去首尾空白、把连续空白压成一个空格", () => {
      expect(cleanPlaylistName("  通勤   路上 ")).toBe("通勤 路上");
    });

    it("截断到 40 字", () => {
      expect(cleanPlaylistName("歌".repeat(60))).toHaveLength(40);
    });

    it("全空白得到空串（由调用方拒绝）", () => {
      expect(cleanPlaylistName("   ")).toBe("");
    });
  });

  it("建歌单后能读回来，初始 0 首", () => {
    const created = createPlaylist(db, alice, "通勤", 1000);

    const listed = listPlaylists(db, alice);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: created.id, name: "通勤", trackCount: 0 });
  });

  it("歌单按建得早的在上", () => {
    createPlaylist(db, alice, "后来", 2000);
    createPlaylist(db, alice, "先建", 1000);

    expect(listPlaylists(db, alice).map((playlist) => playlist.name)).toEqual(["先建", "后来"]);
  });

  it("同一个人不能建重名歌单，抛 PlaylistNameTakenError", () => {
    createPlaylist(db, alice, "通勤");
    expect(() => createPlaylist(db, alice, "通勤")).toThrow(PlaylistNameTakenError);
  });

  it("不同的人可以各有一个同名歌单", () => {
    createPlaylist(db, alice, "通勤");
    expect(() => createPlaylist(db, bob, "通勤")).not.toThrow();
  });

  it("改名成功；改成别人的同名歌单名会被拒", () => {
    const mine = createPlaylist(db, alice, "通勤");
    createPlaylist(db, alice, "收藏");

    expect(renamePlaylist(db, alice, mine.id, "路上")?.name).toBe("路上");
    expect(() => renamePlaylist(db, alice, mine.id, "收藏")).toThrow(PlaylistNameTakenError);
  });

  it("改别人的歌单返回 null", () => {
    const theirs = createPlaylist(db, bob, "通勤");
    expect(renamePlaylist(db, alice, theirs.id, "偷改")).toBeNull();
  });

  it("加歌进歌单：返回实际新增数，重复加不算", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    const b = track(alice, "B", 2);

    expect(addTracksToPlaylist(db, alice, playlist.id, [a.id, b.id])).toBe(2);
    expect(addTracksToPlaylist(db, alice, playlist.id, [a.id])).toBe(0);
    expect(findPlaylist(db, alice, playlist.id)?.trackCount).toBe(2);
  });

  it("歌单内顺序 = 加进来的先后", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    const b = track(alice, "B", 2);
    const c = track(alice, "C", 3);

    addTracksToPlaylist(db, alice, playlist.id, [c.id], 1000);
    addTracksToPlaylist(db, alice, playlist.id, [a.id], 2000);
    addTracksToPlaylist(db, alice, playlist.id, [b.id], 3000);

    expect(playlistTrackIds(db, alice, playlist.id)).toEqual([c.id, a.id, b.id]);
  });

  it("加别人的歌进自己的歌单：被过滤，不进歌单", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const theirs = track(bob, "Bob 的歌", 1);

    expect(addTracksToPlaylist(db, alice, playlist.id, [theirs.id])).toBe(0);
    expect(findPlaylist(db, alice, playlist.id)?.trackCount).toBe(0);
  });

  it("往别人的歌单加歌返回 null", () => {
    const theirs = createPlaylist(db, bob, "通勤");
    const mine = track(alice, "A", 1);
    expect(addTracksToPlaylist(db, alice, theirs.id, [mine.id])).toBeNull();
  });

  it("从歌单移除一首：歌本身还在曲库", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    addTracksToPlaylist(db, alice, playlist.id, [a.id]);

    expect(removeTrackFromPlaylist(db, alice, playlist.id, a.id)).toBe(true);
    expect(findPlaylist(db, alice, playlist.id)?.trackCount).toBe(0);
    expect(findTrack(db, alice, a.id)).not.toBeNull();
  });

  it("删歌单不会删歌，关联行被级联清掉", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    addTracksToPlaylist(db, alice, playlist.id, [a.id]);

    expect(deletePlaylist(db, alice, playlist.id)).toBe(true);

    expect(findPlaylist(db, alice, playlist.id)).toBeNull();
    expect(findTrack(db, alice, a.id)).not.toBeNull();
    const links = db.prepare("SELECT count(*) AS n FROM playlist_tracks").get() as { n: number };
    expect(links.n).toBe(0);
  });

  it("删别人的歌单返回 false，对方歌单还在", () => {
    const theirs = createPlaylist(db, bob, "通勤");
    expect(deletePlaylist(db, alice, theirs.id)).toBe(false);
    expect(findPlaylist(db, bob, theirs.id)).not.toBeNull();
  });

  it("删歌时它在歌单里的关联也消失（外键级联）", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    addTracksToPlaylist(db, alice, playlist.id, [a.id]);

    db.prepare("DELETE FROM music_tracks WHERE id = ?").run(a.id);

    expect(findPlaylist(db, alice, playlist.id)?.trackCount).toBe(0);
  });

  it("一首歌可以同时属于多个歌单", () => {
    const commute = createPlaylist(db, alice, "通勤", 1);
    const fav = createPlaylist(db, alice, "收藏", 2);
    const a = track(alice, "A", 1);

    expect(setTrackPlaylists(db, alice, a.id, [commute.id, fav.id])).toBe(true);

    expect(findTrack(db, alice, a.id)?.playlistIds.sort()).toEqual([commute.id, fav.id].sort());
    expect(findPlaylist(db, alice, commute.id)?.trackCount).toBe(1);
    expect(findPlaylist(db, alice, fav.id)?.trackCount).toBe(1);
  });

  it("setTrackPlaylists 是全量覆盖：传空数组就是清空归属", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    setTrackPlaylists(db, alice, a.id, [playlist.id]);

    setTrackPlaylists(db, alice, a.id, []);

    expect(findTrack(db, alice, a.id)?.playlistIds).toEqual([]);
    expect(findPlaylist(db, alice, playlist.id)?.trackCount).toBe(0);
  });

  it("setTrackPlaylists 会丢掉不属于自己的歌单 id", () => {
    const theirs = createPlaylist(db, bob, "Bob 的歌单");
    const a = track(alice, "A", 1);

    setTrackPlaylists(db, alice, a.id, [theirs.id]);

    expect(findTrack(db, alice, a.id)?.playlistIds).toEqual([]);
    expect(findPlaylist(db, bob, theirs.id)?.trackCount).toBe(0);
  });

  it("改别人的歌的归属返回 false", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const theirs = track(bob, "Bob 的歌", 1);
    expect(setTrackPlaylists(db, alice, theirs.id, [playlist.id])).toBe(false);
  });

  it("歌单内可拖拽重排", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    const b = track(alice, "B", 2);
    const c = track(alice, "C", 3);
    addTracksToPlaylist(db, alice, playlist.id, [a.id, b.id, c.id]);

    expect(reorderPlaylistTracks(db, alice, playlist.id, [c.id, b.id, a.id])).toBe(true);
    expect(playlistTrackIds(db, alice, playlist.id)).toEqual([c.id, b.id, a.id]);
  });

  it("歌单重排只动本歌单，不影响曲库顺序与别的歌单", () => {
    const commute = createPlaylist(db, alice, "通勤", 1);
    const fav = createPlaylist(db, alice, "收藏", 2);
    const a = track(alice, "A", 1);
    const b = track(alice, "B", 2);
    addTracksToPlaylist(db, alice, commute.id, [a.id, b.id]);
    addTracksToPlaylist(db, alice, fav.id, [a.id, b.id]);

    reorderPlaylistTracks(db, alice, commute.id, [b.id, a.id]);

    expect(playlistTrackIds(db, alice, commute.id)).toEqual([b.id, a.id]);
    expect(playlistTrackIds(db, alice, fav.id)).toEqual([a.id, b.id]);
    expect(listTracks(db, alice).tracks.map((t) => t.id)).toEqual([a.id, b.id]);
  });

  it("新加进歌单的歌排在末尾", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    const b = track(alice, "B", 2);
    const c = track(alice, "C", 3);
    addTracksToPlaylist(db, alice, playlist.id, [a.id]);
    reorderPlaylistTracks(db, alice, playlist.id, [a.id]);
    addTracksToPlaylist(db, alice, playlist.id, [c.id, b.id]);

    expect(playlistTrackIds(db, alice, playlist.id)).toEqual([a.id, c.id, b.id]);
  });

  it("往别人的歌单重排返回 false", () => {
    const theirs = createPlaylist(db, bob, "通勤");
    const mine = track(alice, "A", 1);
    expect(reorderPlaylistTracks(db, alice, theirs.id, [mine.id])).toBe(false);
  });

  it("重排时混进不在歌单里的歌 id，被丢掉", () => {
    const playlist = createPlaylist(db, alice, "通勤");
    const inside = track(alice, "Inside", 1);
    const outside = track(alice, "Outside", 2);
    addTracksToPlaylist(db, alice, playlist.id, [inside.id]);

    reorderPlaylistTracks(db, alice, playlist.id, [outside.id, inside.id]);

    // 歌单里还是只有那一首，且不会被 outside 挤动
    expect(playlistTrackIds(db, alice, playlist.id)).toEqual([inside.id]);
  });

  it("列表里每首歌带回自己的歌单归属", () => {
    const commute = createPlaylist(db, alice, "通勤");
    const a = track(alice, "A", 1);
    const b = track(alice, "B", 2);
    setTrackPlaylists(db, alice, a.id, [commute.id]);

    const { tracks } = listTracks(db, alice);

    expect(tracks.find((item) => item.id === a.id)?.playlistIds).toEqual([commute.id]);
    expect(tracks.find((item) => item.id === b.id)?.playlistIds).toEqual([]);
  });

  it("列表不会把别人的歌单归属串进来", () => {
    const theirs = createPlaylist(db, bob, "Bob 的歌单");
    const mine = track(alice, "A", 1);
    const Bobs = track(bob, "B", 2);
    setTrackPlaylists(db, bob, Bobs.id, [theirs.id]);

    const { tracks } = listTracks(db, alice);

    expect(tracks.find((item) => item.id === mine.id)?.playlistIds).toEqual([]);
  });
});

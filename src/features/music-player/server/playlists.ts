import "server-only";

import type { Db } from "@/lib/auth/db";

/**
 * 歌单的数据访问（《数据库/音乐歌单表》features/music-player/README.md §2.1.2）。
 *
 * 两个原则：
 *
 * 1. **歌单只是关联，不复制歌曲。** 删歌单只删 `playlists` 那一行，
 *    `playlist_tracks` 由外键级联清掉，`music_tracks` 一行不动。
 * 2. **每条查询都带 `user_id`。** 歌单和曲目都按用户隔离；跨用户拿 id 来试
 *    只会得到 404，不会得到「删了别人东西还回成功」。
 *
 * 歌单名称唯一（`UNIQUE (user_id, name)`），重名时这里抛 `PlaylistNameTakenError`，
 * 由接口翻译成 409 + 一句人话——不要把一个 SQLite 的约束错误直接冒到界面上。
 */

/** 对外的歌单表示（camelCase）。 */
export interface Playlist {
  id: number;
  name: string;
  /** 歌单里有几首 */
  trackCount: number;
  createdAt: number;
  updatedAt: number;
}

interface PlaylistRow {
  id: number;
  name: string;
  track_count: number;
  created_at: number;
  updated_at: number;
}

/** 歌单重名。单独一个类，接口据此回 409 而不是 500。 */
export class PlaylistNameTakenError extends Error {
  constructor() {
    super("已经有同名歌单了");
    this.name = "PlaylistNameTakenError";
  }
}

/** 歌单名清洗：去首尾空白、压缩连续空白、截断到 40 字。空名返回空串（由调用方拒绝）。 */
export function cleanPlaylistName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 40);
}

function toPlaylist(row: PlaylistRow): Playlist {
  return {
    id: row.id,
    name: row.name,
    trackCount: row.track_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_PLAYLISTS = `
  SELECT p.id, p.name, p.created_at, p.updated_at,
         (SELECT count(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS track_count
  FROM playlists p
`;

/** 一个人的所有歌单，按建得早的在上（跟曲库列表同一个方向）。 */
export function listPlaylists(db: Db, userId: number): Playlist[] {
  const rows = db
    .prepare(`${SELECT_PLAYLISTS} WHERE p.user_id = ? ORDER BY p.created_at ASC, p.id ASC`)
    .all(userId) as PlaylistRow[];
  return rows.map(toPlaylist);
}

/** 按 id 取一个歌单；不属于该用户时返回 null。 */
export function findPlaylist(db: Db, userId: number, playlistId: number): Playlist | null {
  const row = db
    .prepare(`${SELECT_PLAYLISTS} WHERE p.user_id = ? AND p.id = ?`)
    .get(userId, playlistId) as PlaylistRow | undefined;
  return row ? toPlaylist(row) : null;
}

/** 建歌单。名字已由调用方 `cleanPlaylistName` 清洗过且非空。 */
export function createPlaylist(
  db: Db,
  userId: number,
  name: string,
  now = Date.now(),
): Playlist {
  try {
    const result = db
      .prepare(
        "INSERT INTO playlists (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(userId, name, now, now);
    return {
      id: Number(result.lastInsertRowid),
      name,
      trackCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    if (isUniqueViolation(error)) throw new PlaylistNameTakenError();
    throw error;
  }
}

/** 改歌单名，返回改完的那一行；不存在或不属于该用户时返回 null。 */
export function renamePlaylist(
  db: Db,
  userId: number,
  playlistId: number,
  name: string,
  now = Date.now(),
): Playlist | null {
  try {
    const result = db
      .prepare("UPDATE playlists SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(name, now, playlistId, userId);
    if (result.changes === 0) return null;
    return findPlaylist(db, userId, playlistId);
  } catch (error) {
    if (isUniqueViolation(error)) throw new PlaylistNameTakenError();
    throw error;
  }
}

/**
 * 删歌单。**只删歌单本身**，`playlist_tracks` 的关联行由外键级联清掉，
 * 曲库里的歌一首不动（features/music-player/README.md §七第 16 条）。
 * 返回是否真的删掉了。
 */
export function deletePlaylist(db: Db, userId: number, playlistId: number): boolean {
  const result = db
    .prepare("DELETE FROM playlists WHERE id = ? AND user_id = ?")
    .run(playlistId, userId);
  return result.changes > 0;
}

/**
 * 把一批歌加进一个歌单，返回**实际新增**的数量。
 *
 * `INSERT OR IGNORE`：已经在歌单里的歌不会重复加，也不报错（用户勾了 5 首，
 * 其中 2 首本来就在，期望是「都加进去了」，不是「有 2 首失败」）。
 * 不属于该用户的歌 id 会被过滤掉——不能靠歌单 id 去碰别人的曲目。
 */
export function addTracksToPlaylist(
  db: Db,
  userId: number,
  playlistId: number,
  trackIds: number[],
  now = Date.now(),
): number | null {
  if (!findPlaylist(db, userId, playlistId)) return null;

  const wanted = [...new Set(trackIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (wanted.length === 0) return 0;

  const ownTracks = db
    .prepare(
      `SELECT id FROM music_tracks
       WHERE user_id = ? AND id IN (${wanted.map(() => "?").join(",")})`,
    )
    .all(userId, ...wanted) as { id: number }[];

  let added = 0;
  db.transaction(() => {
    // 追加到歌单末尾：新加的歌排在现有歌的后面
    const next = (
      db
        .prepare(
          "SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_tracks WHERE playlist_id = ?",
        )
        .get(playlistId) as { next: number }
    ).next;

    const insert = db.prepare(
      "INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at) VALUES (?, ?, ?, ?)",
    );
    // **按调用方给的顺序插**，不是按 SQL 返回的顺序：`IN (...)` 的结果是 id 升序，
    // 拿它去排 position 会把用户勾选的顺序打乱（勾了 [3,1,2] 就变成 [1,2,3]）
    const owned = new Set(ownTracks.map((track) => track.id));
    let offset = 0;
    for (const id of wanted) {
      if (!owned.has(id)) continue;
      added += insert.run(playlistId, id, next + offset, now).changes;
      offset += 1;
    }
    if (added > 0) {
      db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now, playlistId);
    }
  })();

  return added;
}

/**
 * 把歌单内的顺序重排成 `orderedIds`（features/music-player/README.md §2.1.5）。
 *
 * 只动**这个歌单里**的关联行；不属于该歌单的 id 被丢掉（不能靠这个接口把歌塞进歌单，
 * 那是 `addTracksToPlaylist` 的事）。
 */
export function reorderPlaylistTracks(
  db: Db,
  userId: number,
  playlistId: number,
  orderedIds: number[],
  now = Date.now(),
): boolean {
  if (!findPlaylist(db, userId, playlistId)) return false;

  const wanted = [...new Set(orderedIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (wanted.length === 0) return false;

  const existing = db
    .prepare(
      `SELECT track_id AS id FROM playlist_tracks
       WHERE playlist_id = ? AND track_id IN (${wanted.map(() => "?").join(",")})`,
    )
    .all(playlistId, ...wanted) as { id: number }[];
  const existingSet = new Set(existing.map((row) => row.id));

  const final = wanted.filter((id) => existingSet.has(id));
  if (final.length === 0) return false;

  const update = db.prepare(
    "UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?",
  );
  db.transaction(() => {
    final.forEach((id, index) => update.run(index, playlistId, id));
    db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now, playlistId);
  })();

  return true;
}

/** 从歌单里移除一首歌。歌本身还在曲库里。 */
export function removeTrackFromPlaylist(
  db: Db,
  userId: number,
  playlistId: number,
  trackId: number,
  now = Date.now(),
): boolean {
  if (!findPlaylist(db, userId, playlistId)) return false;

  const result = db
    .prepare("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?")
    .run(playlistId, trackId);

  if (result.changes > 0) {
    db.prepare("UPDATE playlists SET updated_at = ? WHERE id = ?").run(now, playlistId);
  }
  return result.changes > 0;
}

/** 某个歌单里的歌 id，按用户拖出来的顺序（这就是歌单内播放顺序）。 */
export function playlistTrackIds(db: Db, userId: number, playlistId: number): number[] | null {
  if (!findPlaylist(db, userId, playlistId)) return null;

  const rows = db
    .prepare(
      `SELECT pt.track_id AS id
       FROM playlist_tracks pt
       JOIN music_tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? AND t.user_id = ?
       ORDER BY pt.position ASC, pt.track_id ASC`,
    )
    .all(playlistId, userId) as { id: number }[];

  return rows.map((row) => row.id);
}

/** 歌单 + 它的曲目 id 序列。前端靠它算「在这个歌单里往下放」的队列。 */
export interface PlaylistWithTracks extends Playlist {
  trackIds: number[];
}

/**
 * 所有歌单连同各自的曲目 id。
 *
 * 一次查询把所有关联取回来再在内存里分组，不是每个歌单查一次（N+1）。
 * 顺序就是歌单内播放顺序：`added_at ASC, track_id ASC`。
 */
export function listPlaylistsWithTracks(db: Db, userId: number): PlaylistWithTracks[] {
  const playlists = listPlaylists(db, userId);
  if (playlists.length === 0) return [];

  const rows = db
    .prepare(
      `SELECT pt.playlist_id AS playlistId, pt.track_id AS trackId
       FROM playlist_tracks pt
       JOIN music_tracks t ON t.id = pt.track_id
       WHERE t.user_id = ?
       ORDER BY pt.position ASC, pt.track_id ASC`,
    )
    .all(userId) as { playlistId: number; trackId: number }[];

  const byPlaylist = new Map<number, number[]>();
  for (const row of rows) {
    const list = byPlaylist.get(row.playlistId);
    if (list) list.push(row.trackId);
    else byPlaylist.set(row.playlistId, [row.trackId]);
  }

  return playlists.map((playlist) => ({
    ...playlist,
    trackIds: byPlaylist.get(playlist.id) ?? [],
  }));
}

/** SQLite 的唯一约束错误。判定靠 message 里的 `UNIQUE constraint failed`。 */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

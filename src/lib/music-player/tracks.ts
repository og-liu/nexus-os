import type { Db } from "@/lib/auth/db";

/**
 * 曲目的数据访问（《数据库/音乐曲目表》《功能/音乐播放器》§三）。
 *
 * 分工：这里只碰数据库，不碰磁盘、不碰请求上下文。
 * 所有查询都带 `user_id = ?`——归属从第一天就生效，不是「反正只有一个用户」的自觉。
 *
 * **列表顺序就是播放顺序**：`created_at ASC`（先传的在上）。整张专辑一次传进来、
 * 从上往下播，正好是专辑自己的顺序；倒序会让「下一首」永远往上一首的方向走。
 * 新歌因此加在列表末尾，上传完成后界面滚到底部去接它。
 */

/** 对外的曲目表示（camelCase）。库里的行是 snake_case，转换只在 `toTrack` 一处发生。 */
export interface Track {
  id: number;
  title: string;
  /** 文件自带的歌手标签；没有就是 null，界面不显示这一段 */
  artist: string | null;
  /** 磁盘上的名字 `<uuid>.<ext>`，不含路径 */
  fileName: string;
  /** ffmpeg 探到的真实编码，如 `mp3` / `flac` */
  codec: string;
  sizeBytes: number;
  /** 毫秒；探不出时长的是 null，界面显示 `--:--` */
  durationMs: number | null;
  createdAt: number;
  /** 这首歌在哪些歌单里（歌单 id）。编辑弹框的复选框直接读它 */
  playlistIds: number[];
}

/** 曲库：列表 + 合计体积（配额提示用，免得前端再算一遍）。 */
export interface TrackList {
  tracks: Track[];
  totalBytes: number;
}

/** 新建一首歌要写进来的东西。`file_name` 与 `codec` 由上传流程决定。 */
export interface NewTrack {
  title: string;
  artist: string | null;
  fileName: string;
  codec: string;
  sizeBytes: number;
  durationMs: number | null;
}

interface TrackRow {
  id: number;
  title: string;
  artist: string | null;
  file_name: string;
  codec: string;
  size_bytes: number;
  duration_ms: number | null;
  created_at: number;
}

const SELECT_COLUMNS =
  "id, title, artist, file_name, codec, size_bytes, duration_ms, created_at";

/**
 * 这首歌在哪些歌单里。调用方必须已经确认这首歌属于该用户——
 * 归属表本身不带 `user_id`，用户维度在 `playlists` 上。
 */
function playlistIdsOf(db: Db, trackId: number): number[] {
  const rows = db
    .prepare("SELECT playlist_id FROM playlist_tracks WHERE track_id = ? ORDER BY playlist_id ASC")
    .all(trackId) as { playlist_id: number }[];
  return rows.map((row) => row.playlist_id);
}

function toTrack(row: TrackRow, playlistIds: number[]): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    fileName: row.file_name,
    codec: row.codec,
    sizeBytes: row.size_bytes,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    playlistIds,
  };
}

/**
 * 一个人的整个曲库。
 *
 * `ORDER BY position ASC, id ASC`：`position` 是用户拖出来的顺序（升序 = 从上到下）；
 * 末尾 `id ASC` 是稳定排序的兜底——两次拖拽之间可能出现相同的 position，SQL 不保证等值行的顺序。
 *
 * 歌单归属用**一条额外查询**批量取回再在内存里归拢，不是每首歌查一次：
 * 几十上百首时 N+1 会把一次列表请求变成上百次查询。
 */
export function listTracks(db: Db, userId: number): TrackList {
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM music_tracks
       WHERE user_id = ?
       ORDER BY position ASC, id ASC`,
    )
    .all(userId) as TrackRow[];

  const totalBytes = rows.reduce((sum, row) => sum + row.size_bytes, 0);

  const links = db
    .prepare(
      `SELECT pt.track_id AS trackId, pt.playlist_id AS playlistId
       FROM playlist_tracks pt
       JOIN playlists p ON p.id = pt.playlist_id
       WHERE p.user_id = ?
       ORDER BY pt.playlist_id ASC`,
    )
    .all(userId) as { trackId: number; playlistId: number }[];

  const byTrack = new Map<number, number[]>();
  for (const link of links) {
    const list = byTrack.get(link.trackId);
    if (list) list.push(link.playlistId);
    else byTrack.set(link.trackId, [link.playlistId]);
  }

  return {
    tracks: rows.map((row) => toTrack(row, byTrack.get(row.id) ?? [])),
    totalBytes,
  };
}

/** 按 id 取一首（要带 `user_id`，否则就是「知道编号就能听别人的歌」）。 */
export function findTrack(db: Db, userId: number, trackId: number): Track | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM music_tracks WHERE id = ? AND user_id = ?`)
    .get(trackId, userId) as TrackRow | undefined;
  return row ? toTrack(row, playlistIdsOf(db, row.id)) : null;
}

/** 已用容量（字节）。配额判断用它，不要在前端算。 */
export function usedBytes(db: Db, userId: number): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(size_bytes), 0) AS used FROM music_tracks WHERE user_id = ?")
    .get(userId) as { used: number };
  return row.used;
}

/** 新建一条曲目记录。磁盘文件在调用这里之前已经写好。 */
export function createTrack(
  db: Db,
  userId: number,
  input: NewTrack,
  now = Date.now(),
): Track {
  const result = db
    .prepare(
      `INSERT INTO music_tracks
         (user_id, title, artist, file_name, codec, size_bytes, duration_ms, position, created_at)
       VALUES (
         ?, ?, ?, ?, ?, ?, ?,
         -- 新歌排在末尾。用子查询而不是先查一次再插：那条 SELECT 与 INSERT 之间
         -- 可能插进另一个上传，两首都拿到同一个 position
         (SELECT COALESCE(MAX(position), -1) + 1 FROM music_tracks WHERE user_id = ?),
         ?
       )`,
    )
    .run(
      userId,
      input.title,
      input.artist,
      input.fileName,
      input.codec,
      input.sizeBytes,
      input.durationMs,
      userId,
      now,
    );

  return {
    id: Number(result.lastInsertRowid),
    title: input.title,
    artist: input.artist,
    fileName: input.fileName,
    codec: input.codec,
    sizeBytes: input.sizeBytes,
    durationMs: input.durationMs,
    createdAt: now,
    playlistIds: [],
  };
}

/**
 * 把曲库整体重排成 `orderedIds` 给的顺序（《功能/音乐播放器》§2.1.5）。
 *
 * **只认属于这个用户的 id**：混进来的别人的 id 直接丢掉，不会顺手改别人的顺序。
 * 不在 `orderedIds` 里的歌**保持原 position 不动**——前端传的是完整列表，
 * 但万一传输中少了一首（比如同时在另一个标签页删了歌），不该把它挤到最前面。
 *
 * 一次事务里逐行写：拖拽一次最多百来行，比维护「间隙插入 + 定期重排」的复杂度划算得多。
 */
export function reorderTracks(db: Db, userId: number, orderedIds: number[]): boolean {
  const wanted = [...new Set(orderedIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (wanted.length === 0) return false;

  const owned = db
    .prepare(
      `SELECT id FROM music_tracks
       WHERE user_id = ? AND id IN (${wanted.map(() => "?").join(",")})`,
    )
    .all(userId, ...wanted) as { id: number }[];
  const ownedSet = new Set(owned.map((row) => row.id));

  const final = wanted.filter((id) => ownedSet.has(id));
  if (final.length === 0) return false;

  const update = db.prepare("UPDATE music_tracks SET position = ? WHERE id = ? AND user_id = ?");
  db.transaction(() => {
    final.forEach((id, index) => update.run(index, id, userId));
  })();

  return true;
}

/** 改元数据时能改的字段。`fileName` / `codec` / 体积时长都不在这里——它们来自文件本身。 */
export interface TrackPatch {
  title: string;
  artist: string | null;
}

/**
 * 改一首歌的歌名与歌手，返回改完的那一行；不属于该用户时返回 null。
 *
 * **只改数据库，不碰磁盘文件**：磁盘上是 `<uuid>.<ext>`，名称不承载语义（《功能/音乐播放器》§四第 15 条）。
 */
export function updateTrack(
  db: Db,
  userId: number,
  trackId: number,
  patch: TrackPatch,
): Track | null {
  const result = db
    .prepare("UPDATE music_tracks SET title = ?, artist = ? WHERE id = ? AND user_id = ?")
    .run(patch.title, patch.artist, trackId, userId);

  if (result.changes === 0) return null;
  return findTrack(db, userId, trackId);
}

/**
 * 把一首歌的所属歌单整体换成 `playlistIds`（全量覆盖，不是增量）。
 *
 * 全量覆盖比「加一个 / 减一个」两个接口简单：编辑弹框本来就是「勾完保存」，
 * 只发一次最终状态。不属于该用户的歌单 id 会被静默丢掉——不能靠传别人的歌单 id
 * 去和自己建立关联。
 */
export function setTrackPlaylists(
  db: Db,
  userId: number,
  trackId: number,
  playlistIds: number[],
): boolean {
  const owns = findTrack(db, userId, trackId);
  if (!owns) return false;

  const wanted = [...new Set(playlistIds)].filter((id) => Number.isInteger(id) && id > 0);

  const valid =
    wanted.length === 0
      ? []
      : (
          db
            .prepare(
              `SELECT id FROM playlists
               WHERE user_id = ? AND id IN (${wanted.map(() => "?").join(",")})`,
            )
            .all(userId, ...wanted) as { id: number }[]
        ).map((row) => row.id);

  const now = Date.now();
  db.transaction(() => {
    db.prepare("DELETE FROM playlist_tracks WHERE track_id = ?").run(trackId);
    // 重新加进来的歌排在各歌单末尾
    const insert = db.prepare(
      `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
       VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?), ?)`,
    );
    for (const playlistId of valid) insert.run(playlistId, trackId, playlistId, now);
    // 歌单的「最近改动」跟着走，将来做「最近用过的歌单」靠它
    if (valid.length > 0) {
      db.prepare(
        `UPDATE playlists SET updated_at = ? WHERE id IN (${valid.map(() => "?").join(",")})`,
      ).run(now, ...valid);
    }
  })();

  return true;
}

/**
 * 删一批曲目，返回**实际删掉**的那些行（调用方拿 `fileName` 去删磁盘文件）。
 *
 * 用一条 `DELETE ... WHERE id IN (...)` 而不是循环单删：一次事务、一次写锁，
 * 中途不会留下「删了一半」的曲库。
 *
 * `AND user_id = ?` 仍在条件里——传进来的 id 里混着别人的曲目时，那些行不会被删，
 * 也不报错，返回值里自然就没有它们（调用方用「要了几个 / 实际删了几个」对账）。
 *
 * **先删库行、再删文件**：反过来一旦中间失败，库里会留下一条指向不存在文件的记录，
 * 界面上点播放就是 404；先删行则最坏只留一个没人引用的文件。
 */
export function deleteTracks(db: Db, userId: number, trackIds: number[]): Track[] {
  const ids = [...new Set(trackIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) return [];

  // 先把要删的行读出来（删除之后就查不到 fileName 了）
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT ${SELECT_COLUMNS} FROM music_tracks
       WHERE user_id = ? AND id IN (${placeholders})`,
    )
    .all(userId, ...ids) as TrackRow[];

  if (rows.length === 0) return [];

  const removedIds = rows.map((row) => row.id);
  const removedPlaceholders = removedIds.map(() => "?").join(", ");
  db.prepare(
    `DELETE FROM music_tracks WHERE user_id = ? AND id IN (${removedPlaceholders})`,
  ).run(userId, ...removedIds);

  return rows.map((row) => toTrack(row, []));
}

/**
 * 删一条曲目，返回被删掉的那一行（调用方拿 `fileName` 去删磁盘文件）；
 * 找不到、或不属于该用户时返回 null。
 *
 * 只是 `deleteTracks` 的单元素包装——保留它是因为「删一首」在 API 与界面里
 * 都是独立语义（`?id=` 与行尾垃圾桶），调用处不该为了一个 id 去拼数组。
 */
export function deleteTrack(db: Db, userId: number, trackId: number): Track | null {
  return deleteTracks(db, userId, [trackId])[0] ?? null;
}

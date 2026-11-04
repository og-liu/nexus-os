import type { Db } from "@/lib/auth/db";

/**
 * 「上次播到哪」（《功能/音乐播放器》§2.1.6）。
 *
 * 一人一行，住在服务端而不是 localStorage：
 *
 * - **按用户隔离是天然的**——localStorage 是「这台浏览器」的，换个账号登录就串了；
 * - **换设备也能接上**（跟原生音乐 App 一样）；
 * - 数据量极小：每人一行、几百字节。
 *
 * 只记四样：哪首歌、播到第几毫秒、当时在哪个歌单里、**离开时是不是正在播**。
 *
 * 「是否正在播」是 2026-11-04 联调补的：原来不记（想当然地认为「浏览器不许无手势自动播，
 * 记了也用不上」），结果是个真 bug——恢复逻辑会顺带 `play()`，于是**暂停着刷新也会自己响**。
 * 记下来之后：暂停刷新保持暂停，播放中刷新才尝试接着播（被浏览器拒绝就停在暂停态）。
 */

export interface PlaybackState {
  /** 上次播的那首；被删了就是 null */
  trackId: number | null;
  /** 当时所在歌单；全库播放或歌单已被删就是 null */
  playlistId: number | null;
  /** 毫秒 */
  positionMs: number;
  /** 上次离开时是不是正在播：刷新后据此决定要不要自动按播放。 */
  playing: boolean;
  updatedAt: number;
}

interface PlaybackRow {
  track_id: number | null;
  playlist_id: number | null;
  position_ms: number;
  is_playing: number;
  updated_at: number;
}

/** 读上次的进度；从来没播过返回 null。 */
export function readPlaybackState(db: Db, userId: number): PlaybackState | null {
  const row = db
    .prepare(
      "SELECT track_id, playlist_id, position_ms, is_playing, updated_at FROM music_playback WHERE user_id = ?",
    )
    .get(userId) as PlaybackRow | undefined;

  if (!row) return null;
  return {
    trackId: row.track_id,
    playlistId: row.playlist_id,
    positionMs: row.position_ms,
    playing: row.is_playing === 1,
    updatedAt: row.updated_at,
  };
}

/**
 * 写上次的进度（有则覆盖）。
 *
 * `positionMs` 会被夹到非负整数：前端可能在 `loadedmetadata` 之前就上报一个
 * `Infinity` 或 `NaN`，那种值写进库会让下次恢复直接跳到底。
 *
 * 传入的 `trackId` / `playlistId` 不会被验证归属——它们来自同一个用户自己的前端上报，
 * 而且这两个外键只做「置空」用，读回来时还会再和库里的曲目/歌单对一遍（不存在就当 null）。
 */
export function savePlaybackState(
  db: Db,
  userId: number,
  input: {
    trackId: number | null;
    playlistId: number | null;
    positionMs: number;
    /** 此刻是不是正在播。 */
    playing: boolean;
  },
  now = Date.now(),
): void {
  const positionMs = Number.isFinite(input.positionMs)
    ? Math.max(0, Math.round(input.positionMs))
    : 0;

  db.prepare(
    `INSERT INTO music_playback (user_id, track_id, playlist_id, position_ms, is_playing, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       track_id    = excluded.track_id,
       playlist_id = excluded.playlist_id,
       position_ms = excluded.position_ms,
       is_playing  = excluded.is_playing,
       updated_at  = excluded.updated_at`,
  ).run(
    userId,
    input.trackId !== null && Number.isInteger(input.trackId) && input.trackId > 0
      ? input.trackId
      : null,
    input.playlistId !== null && Number.isInteger(input.playlistId) && input.playlistId > 0
      ? input.playlistId
      : null,
    positionMs,
    input.playing ? 1 : 0,
    now,
  );
}

/**
 * 把「上次播到哪」对齐到**当前还在的东西**上。
 *
 * 歌删了、歌单删了都会让这行里留着 null 或过期的 id。这里统一收口：
 * - 歌不在了 → 整条作废（恢复一首不存在的歌没有意义）
 * - 歌单不在了 → 退回全库（歌还在，只是那摊没了）
 *
 * 不这么做的话，前端要写三段判空，而且每加一处「删东西」都得回来补一次。
 */
export function resolvePlaybackState(
  db: Db,
  userId: number,
  state: PlaybackState | null,
): PlaybackState | null {
  if (!state || state.trackId === null) return null;

  const track = db
    .prepare("SELECT id FROM music_tracks WHERE id = ? AND user_id = ?")
    .get(state.trackId, userId) as { id: number } | undefined;
  if (!track) return null;

  let playlistId = state.playlistId;
  if (playlistId !== null) {
    const playlist = db
      .prepare("SELECT id FROM playlists WHERE id = ? AND user_id = ?")
      .get(playlistId, userId) as { id: number } | undefined;
    if (!playlist) playlistId = null;
  }

  return { ...state, playlistId };
}

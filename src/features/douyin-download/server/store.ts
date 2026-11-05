import "server-only";

import type { Db } from "@/lib/auth/db";
import type { DouyinVideo } from "./client";

/**
 * 解析结果的缓存（features/douyin-download/README.md §三）。
 *
 * 分工：这里只碰数据库，HTTP 在 `client.ts`，请求上下文在 Route Handler。
 *
 * 为什么不按用户隔离：这张表存的是**外部接口响应的本地副本**，不是谁的资产。
 * 同一个视频无论谁解析过，拿到的都是同一份公开数据——按用户存只会多存几份。
 */

/** 直链的有效期。超过这个时间的行仍然可读（下载时会重解析），但不再算「新鲜」。 */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedVideo extends DouyinVideo {
  /** 这一行是什么时候取的（毫秒时间戳） */
  fetchedAt: number;
}

interface CachedVideoRow {
  aweme_id: string;
  title: string;
  author: string;
  cover_url: string;
  duration_ms: number;
  play_url: string;
  fetched_at: number;
}

const SELECT_COLUMNS = "aweme_id, title, author, cover_url, duration_ms, play_url, fetched_at";

function toCachedVideo(row: CachedVideoRow): CachedVideo {
  return {
    awemeId: row.aweme_id,
    title: row.title,
    author: row.author,
    coverUrl: row.cover_url,
    durationMs: row.duration_ms,
    playUrl: row.play_url,
    fetchedAt: row.fetched_at,
  };
}

/**
 * 按 id 取缓存，不看时间。下载路由用它：直链过期也先试一次，403 了再重解析。
 */
export function findVideo(db: Db, awemeId: string): CachedVideo | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLUMNS} FROM douyin_videos WHERE aweme_id = ?`)
    .get(awemeId) as CachedVideoRow | undefined;
  return row ? toCachedVideo(row) : null;
}

/**
 * 只在缓存还新鲜时返回。解析路由用它——命中就不再调上游，这一层就是省钱的地方。
 */
export function findFreshVideo(db: Db, awemeId: string, now = Date.now()): CachedVideo | null {
  const cached = findVideo(db, awemeId);
  if (!cached) return null;
  return now - cached.fetchedAt <= CACHE_TTL_MS ? cached : null;
}

/** 缓存行保留多久。超过这个时间的行不会再有用了（直链早废），留着只是脏数据。 */
const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 写入或刷新一行（同一个 id 覆盖）。解析成功和下载时重解析都走这里。
 */
export function saveVideo(db: Db, video: DouyinVideo, now = Date.now()): void {
  db.prepare(
    `INSERT INTO douyin_videos (aweme_id, title, author, cover_url, duration_ms, play_url, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(aweme_id) DO UPDATE SET
       title       = excluded.title,
       author      = excluded.author,
       cover_url   = excluded.cover_url,
       duration_ms = excluded.duration_ms,
       play_url    = excluded.play_url,
       fetched_at  = excluded.fetched_at`,
  ).run(
    video.awemeId,
    video.title,
    video.author,
    video.coverUrl,
    video.durationMs,
    video.playUrl,
    now,
  );

  // 顺手清掉老行：这张表没有别的清理入口，不清就会随使用量无限增长
  // （每解析一个新视频多一行，永远只增不减）。7 天足够覆盖「今天解析、过两天再下载」。
  // douyin_links 有 ON DELETE CASCADE，会跟着一起清。
  db.prepare("DELETE FROM douyin_videos WHERE fetched_at < ?").run(now - PRUNE_AFTER_MS);
}

/**
 * 这条分享链接之前解析成哪个作品了（不看时间）。
 *
 * 短链本身不含 id，只能靠这张映射跳过重复解析——**不查它就等于每贴一次短链
 * 都重新付一次费**。链接失效时上游会报错，那时也不会误用旧映射。
 */
export function findAwemeIdByLink(db: Db, shareUrl: string): string | null {
  const row = db
    .prepare("SELECT aweme_id FROM douyin_links WHERE share_url = ?")
    .get(shareUrl) as { aweme_id: string } | undefined;
  return row?.aweme_id ?? null;
}

/** 记下这次「链接 → 作品」的对应关系。 */
export function saveLink(db: Db, shareUrl: string, awemeId: string, now = Date.now()): void {
  db.prepare(
    `INSERT INTO douyin_links (share_url, aweme_id, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(share_url) DO UPDATE SET
       aweme_id   = excluded.aweme_id,
       fetched_at = excluded.fetched_at`,
  ).run(shareUrl, awemeId, now);
}

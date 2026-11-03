import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import { containerFor } from "@/lib/music-player/formats";
import { contentRangeHeader, parseRange } from "@/lib/music-player/range";
import {
  resolveMusicRoot,
  statTrackFile,
  userMusicDir,
} from "@/lib/music-player/storage";
import { findTrack } from "@/lib/music-player/tracks";

/**
 * 音频流接口（《功能/音乐播放器》§四第 6 条、§七第 2 条）。
 *
 * `<audio src="/api/tools/music-player/stream?id=7">` 发的是**普通同源 GET**，
 * 会话 cookie 自动带上，所以鉴权就是一次 `getCurrentUser()`——不需要签名 URL。
 *
 * **必须支持 Range**：拖动进度要用，Safari 更是没有 206 就完全不播
 * （Chrome 能容忍 200 全量，所以这个缺陷在 Chrome 上测不出来）。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number): Response {
  return Response.json({ code, error: message }, { status });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  const raw = new URL(request.url).searchParams.get("id") ?? "";
  const trackId = Number(raw);
  if (!Number.isInteger(trackId) || trackId <= 0) {
    return fail("bad-request", "缺少曲目 id", 400);
  }

  const db = getDb();
  const track = findTrack(db, user.id, trackId);
  // 别人的歌与不存在同一回答：不让人靠状态码试探别人的曲库
  if (!track) return fail("not-found", "这首不在你的曲库里", 404);

  const container = containerFor(track.codec);
  if (!container) return fail("unsupported", "这个编码放不了", 415);

  const filePath = path.join(userMusicDir(resolveMusicRoot(), user.id), track.fileName);
  const info = await statTrackFile(filePath);
  // 库里有行、磁盘没文件：多半是迁库时漏搬了文件，给一句能查的话
  if (!info) return fail("missing", "这首歌的文件不在服务器上", 404);

  const size = info.size;
  const range = parseRange(request.headers.get("range"), size);
  const headers: Record<string, string> = {
    "Content-Type": container.mime,
    // private：允许浏览器缓存（拖动更顺），但不许中间代理缓存别人的歌
    "Cache-Control": "private, max-age=3600",
    "Accept-Ranges": "bytes",
  };

  if (!range) {
    const stream = createReadStream(filePath);
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  const stream = createReadStream(filePath, { start: range.start, end: range.end });
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": contentRangeHeader(range, size),
    },
  });
}

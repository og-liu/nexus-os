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

/**
 * Node 的 `Readable` → Web 的 `ReadableStream`，**必须能安全收尾**。
 *
 * **不能直接用 `Readable.toWeb`**（2026-11-04 线上事故）：`<audio preload="metadata">`
 * 只关心文件头，浏览器拿完前几 KB **就断开连接**，而 `createReadStream` 还在继续读——
 * adapter 把数据往已关闭的 controller 里写，Node 抛
 * `ERR_INVALID_STATE: Controller is already closed`（uncaughtException），
 * 而且这个请求会一直挂着：页面的 `load` 事件迟迟不来（实测刷新要等 15 秒）。
 *
 * 这里做三件事：
 * 1. 客户端断开（`request.signal` abort）或流被取消 → **立刻 destroy 文件流**；
 * 2. 往已关闭的 controller 写入时不再上抛——那一次丢掉的 chunk 本来也没人读了；
 * 3. `desiredSize` 见底时暂停读文件，避免把整个大文件一口气读进内存。
 */
function toWebStream(nodeStream: Readable, signal: AbortSignal): ReadableStream<Uint8Array> {
  let done = false;
  const stop = () => {
    done = true;
    nodeStream.destroy();
  };

  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        if (done) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          // controller 已关闭：浏览器不要后面这段了，停掉文件流
          stop();
          return;
        }
        if ((controller.desiredSize ?? 0) <= 0) nodeStream.pause();
      });

      nodeStream.on("end", () => {
        if (done) return;
        done = true;
        try {
          controller.close();
        } catch {
          // 已经关了，忽略
        }
      });

      nodeStream.on("error", () => {
        if (done) return;
        done = true;
        try {
          controller.error(new Error("读取音频文件失败"));
        } catch {
          // 已经关了，忽略
        }
      });
    },
    pull() {
      // 下游消费完一波，继续读文件
      if (!done) nodeStream.resume();
    },
    cancel() {
      stop();
    },
  });
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
    return new Response(toWebStream(stream, request.signal), {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  const stream = createReadStream(filePath, { start: range.start, end: range.end });
  return new Response(toWebStream(stream, request.signal), {
    status: 206,
    headers: {
      ...headers,
      "Content-Length": String(range.end - range.start + 1),
      "Content-Range": contentRangeHeader(range, size),
    },
  });
}

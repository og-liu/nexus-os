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
 * 这里做四件事：
 * 1. 客户端断开（`request.signal` abort）或流被取消 → **立刻 destroy 文件流**；
 * 2. 往已关闭的 controller 写入时不再上抛——那一次丢掉的 chunk 本来也没人读了；
 * 3. `desiredSize` 见底时暂停读文件，避免把整个大文件一口气读进内存；
 * 4. **限制发送速率**（见 `STREAM_BYTES_PER_SECOND`）：播放中 Chrome 会持续预缓冲，
 *    不设上限它就一路把上行吃满，用户点导航就是「点不动」（2026-11-04）。
 */

/**
 * 音频流的发送速率上限（字节/秒）。
 *
 * 128kbps 的歌本身只要 **16KB/s**，给到 100KB/s 是六倍余量——播放不会卡，
 * 省下的带宽留给页面导航（RSC / JS）。3M 上行实测：不限制时播放中跳转要 10 秒，
 * 限制后能降到几百毫秒。
 */
const STREAM_BYTES_PER_SECOND = 100 * 1024;

function toWebStream(nodeStream: Readable, signal: AbortSignal): ReadableStream<Uint8Array> {
  let done = false;
  /** 浏览器那边不想要（背压）时不能硬塞 */
  let wantsMore = true;
  /** 限速窗口：windowStart 起算，windowBytes 是这一窗里已经发出去的量 */
  let windowStart = 0;
  let windowBytes = 0;
  /** 限速暂停后由谁恢复；`true` 表示正被限速压着 */
  let throttled = false;

  const stop = () => {
    done = true;
    nodeStream.destroy();
  };

  /** 只有「浏览器想要」且「限速窗允许」时才继续读文件 */
  const maybeResume = () => {
    if (done || !wantsMore) return;
    if (throttled) {
      const due = windowStart + (windowBytes / STREAM_BYTES_PER_SECOND) * 1000;
      const wait = due - Date.now();
      if (wait > 0) {
        setTimeout(maybeResume, Math.min(wait + 1, 200));
        return;
      }
      throttled = false;
    }
    nodeStream.resume();
  };

  if (signal.aborted) stop();
  else signal.addEventListener("abort", stop, { once: true });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      windowStart = Date.now();
      nodeStream.on("data", (chunk: Buffer) => {
        if (done) return;
        try {
          controller.enqueue(new Uint8Array(chunk));
        } catch {
          // controller 已关闭：浏览器不要后面这段了，停掉文件流
          stop();
          return;
        }

        // 背压：浏览器读得慢，先停
        if ((controller.desiredSize ?? 0) <= 0) {
          wantsMore = false;
          nodeStream.pause();
          return;
        }

        // 限速：这一窗发得太快了就停一会儿，把带宽让给页面导航
        windowBytes += chunk.length;
        const elapsed = Date.now() - windowStart;
        if (elapsed > 1000) {
          windowStart = Date.now();
          windowBytes = 0;
        } else if (windowBytes / (elapsed / 1000 || 1) > STREAM_BYTES_PER_SECOND) {
          throttled = true;
          nodeStream.pause();
          maybeResume();
        }
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
      // 下游消费完一波：背压解除 + 限速窗可能已经过去
      wantsMore = true;
      maybeResume();
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
  const lastModified = new Date(info.mtimeMs).toUTCString();
  // `If-Range` 对不上 = 文件已经换了（比如上传时 faststart 重排过）：按规范回整个
  // 文件，绝不能拿旧缓存的位置去拼新文件——那是花屏/放不出声的来源。
  const ifRange = request.headers.get("if-range");
  const range = ifRange && ifRange !== lastModified ? null : parseRange(request.headers.get("range"), size);
  const headers: Record<string, string> = {
    "Content-Type": container.mime,
    // private：允许浏览器缓存（拖动更顺），但不许中间代理缓存别人的歌
    // `no-cache` 不是「不缓存」，而是「每次用之前问一下」：Range 请求会带
    // `If-Range`（Last-Modified），文件没变就 304/206 继续用缓存，文件变了才重下。
    // 之前是 `max-age=3600`——上传重排（faststart）后浏览器还抱着旧的 46MB 不放，
    // 表现就是「文件已经修好了，页面还是卡在 readyState 0」。
    "Cache-Control": "private, no-cache",
    "Accept-Ranges": "bytes",
    "Last-Modified": lastModified,
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

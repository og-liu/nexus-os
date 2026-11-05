import { randomUUID } from "node:crypto";
import { rename } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/auth/db";
import {
  MAX_TRACK_BYTES,
  USER_QUOTA_BYTES,
  baseNameOf,
  cleanTitle,
  containerFor,
  extensionOf,
  isAcceptedExtension,
} from "../../shared/formats";
import { faststartCopy, probeAudioFile } from "../probe";
import {
  TrackTooLargeError,
  removeTrackFile,
  resolveMusicRoot,
  userMusicDir,
  writeTrackBody,
} from "../storage";
import { createTrack, deleteTracks, findTrack, listTracks, setTrackPlaylists, updateTrack, usedBytes } from "../tracks";
import { listPlaylistsWithTracks } from "../playlists";
import { readPlaybackState, resolvePlaybackState } from "../playback";

/**
 * 曲库接口（features/music-player/README.md §四）。
 *
 * `GET`  —— 读整个曲库（列表 + 合计体积）
 * `POST` —— 上传一首。请求体是**原始字节**，文件名走 `x-file-name` 头
 *
 * 为什么不用 multipart：这个项目已经有先例（音频提取），原始字节 + 一个头比引
 * multipart 解析器简单得多，前端用 XHR 直传也顺手拿到上传进度。
 *
 * 鉴权在这层再做一次：页面的 `requireUser()` 管不住直接 POST 接口的人。
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number): Response {
  return Response.json({ code, error: message }, { status });
}

/** 取上传头里的文件名；解码失败当作没有。 */
function readFileName(request: Request): string {
  const raw = request.headers.get("x-file-name");
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  const db = getDb();
  // 曲目、歌单、上次播到哪一次带回：编辑弹框要勾选「这首歌在哪些歌单里」，
  // 分成两个请求会让弹框出现「复选框一片空白」的中间态（§七第 21 条）；
  // 恢复进度也要和曲库同一批到，否则会出现「先播第一首、再跳回上次那首」的闪动
  return Response.json(
    {
      ...listTracks(db, user.id),
      playlists: listPlaylistsWithTracks(db, user.id),
      resume: resolvePlaybackState(db, user.id, readPlaybackState(db, user.id)),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * 改一首歌的元数据与所属歌单。
 *
 * 请求体：`{ id, title, artist, playlistIds? }`
 * - `title` 去空白后不能为空（歌名是列表的主要识别信息）
 * - `artist` 传空串等于清空（存 null）
 * - `playlistIds` 是**全量覆盖**：给了就整体替换，不给就不动归属
 *
 * 只改数据库，不碰磁盘文件（§四第 15 条）。
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  let body: { id?: unknown; title?: unknown; artist?: unknown; playlistIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad-request", "请求格式不对", 400);
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return fail("bad-request", "缺少曲目 id", 400);

  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim() : "";
  if (!title) return fail("bad-request", "歌名不能为空", 400);

  const artist =
    typeof body.artist === "string" && body.artist.trim() ? body.artist.trim().slice(0, 80) : null;

  const db = getDb();
  const updated = updateTrack(db, user.id, id, { title: title.slice(0, 200), artist });
  // 不存在或不属于该用户：同一个 404，不让人靠状态码试探别人的曲库
  if (!updated) return fail("not-found", "这首歌不在你的曲库里", 404);

  if (Array.isArray(body.playlistIds)) {
    const playlistIds = body.playlistIds
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0);
    setTrackPlaylists(db, user.id, id, playlistIds);
  }

  const fresh = findTrack(db, user.id, id);
  return Response.json({ track: fresh ?? updated });
}

/**
 * 删歌。支持两写法：
 *   `?id=5`            单个（历史上只有这个）
 *   `?ids=1,2,3`       批量（曲库的「批量」模式用）
 *
 * **先删库行、再删文件**（features/music-player/README.md §七第 9 条）：反过来一旦中间失败，
 * 库里会留下一条指向不存在文件的记录，点播放就是 404；先删行则最坏只留一个没人引用的文件。
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  const params = new URL(request.url).searchParams;
  const raw = params.get("ids") ?? params.get("id") ?? "";
  const ids = raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (ids.length === 0) return fail("bad-request", "缺少曲目 id", 400);
  // 一次删太多会把流接口的响应时间拖长、也容易误触；500 首远超正常曲库
  if (ids.length > 500) return fail("bad-request", "一次最多删 500 首", 400);

  const db = getDb();
  const removed = deleteTracks(db, user.id, ids);
  // 全都不属于该用户时与「不存在」同一个回答：不让人靠状态码试探别人的曲库
  if (removed.length === 0) return fail("not-found", "这些歌不在你的曲库里", 404);

  const dir = userMusicDir(resolveMusicRoot(), user.id);
  await Promise.all(
    removed.map((track) => removeTrackFile(path.join(dir, track.fileName))),
  );

  // 把「要了几个 / 实际删了几个」都回给前端：混进别人的 id 时前端能据此提示
  return Response.json({
    ok: true,
    requested: ids.length,
    removed: removed.map((track) => track.id),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("unauthorized", "请先登录", 401);

  const originalName = readFileName(request);
  if (!originalName) return fail("bad-request", "缺少文件名", 400);

  const ext = extensionOf(originalName);
  if (!isAcceptedExtension(ext)) {
    return fail("unsupported", "只支持 mp3 / m4a / aac / wav / flac / ogg 格式", 415);
  }

  // 第一道体积检查：声明的值超了就不用开始收包
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_TRACK_BYTES) {
    return fail("too-large", "文件超过 200 MB", 413);
  }

  const db = getDb();

  // 配额检查放在收包之前：拦得住的话一个字节都不用传
  const used = usedBytes(db, user.id);
  if (Number.isFinite(declared) && used + declared > USER_QUOTA_BYTES) {
    return fail("quota", "曲库已满（5 GB），删掉一些再传", 413);
  }

  const root = resolveMusicRoot();
  const dir = userMusicDir(root, user.id);

  // 落盘名与磁盘上的目录名都先避开用户输入：临时文件固定叫 <uuid>.upload，
  // 探出真实编码后再改名成 <uuid>.<ext>，全程不碰原文件名
  const id = randomUUID();
  const tempPath = path.join(dir, `${id}.upload`);

  try {
    let received: number;
    try {
      received = await writeTrackBody(request.body, tempPath);
    } catch (error) {
      if (error instanceof TrackTooLargeError) {
        return fail("too-large", "文件超过 200 MB", 413);
      }
      throw error;
    }

    // 真实体积也过一遍配额：声明值可以缺席或撒谎
    if (used + received > USER_QUOTA_BYTES) {
      await removeTrackFile(tempPath);
      return fail("quota", "曲库已满（5 GB），删掉一些再传", 413);
    }

    const probe = await probeAudioFile(tempPath);

    // 打不开 / 没有音频流：多半是把别的文件改了扩展名
    if (!probe.hasAnyStream) {
      await removeTrackFile(tempPath);
      return fail("unreadable", "这个文件打不开，换个文件试试", 400);
    }
    if (!probe.codec) {
      await removeTrackFile(tempPath);
      return fail("unreadable", "这个文件里没有音频", 400);
    }

    // 浏览器放不了的编码直接拒：收进来就是一个点开没声音的行
    const container = containerFor(probe.codec);
    if (!container) {
      await removeTrackFile(tempPath);
      return fail("unsupported", `不支持 ${probe.codec.toUpperCase()} 编码`, 415);
    }

    // MP4 系容器（m4a）：把 moov 挪到文件头。默认它在文件末尾——46MB 的音频
    // 浏览器要下完整个文件才知道时长、才能 seek，大文件就成了「永远播不起来」。
    // 失败就用原文件：还能播，只是大文件 seek 慢。
    if (container.ext === "m4a") {
      const fixedPath = `${tempPath}.faststart`;
      if (await faststartCopy(tempPath, fixedPath)) {
        await rename(fixedPath, tempPath);
      } else {
        await removeTrackFile(fixedPath).catch(() => undefined);
      }
    }

    const fileName = `${id}.${container.ext}`;
    const finalPath = path.join(dir, fileName);
    await rename(tempPath, finalPath);

    const track = createTrack(db, user.id, {
      // 歌名优先用文件自带的标签，没有才用文件名去扩展名
      title: probe.title ?? cleanTitle(baseNameOf(originalName)),
      artist: probe.artist,
      fileName,
      codec: probe.codec,
      sizeBytes: received,
      durationMs: probe.durationSec === null ? null : Math.round(probe.durationSec * 1000),
    });

    return Response.json(track, { status: 201 });
  } catch {
    // 兜底：任何没预料到的错误都不留半截文件（tempPath 可能已经被改名，删也无害）
    await removeTrackFile(tempPath);
    return fail("server", "服务器出错了，稍后再试", 500);
  }
}

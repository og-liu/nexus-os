import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolveDatabasePath } from "@/lib/auth/db";
import { MAX_TRACK_BYTES } from "./formats";

/**
 * 音乐文件的落盘位置（《功能/音乐播放器》§四第 4 条）。
 *
 * ```
 * <数据库所在目录>/music/<userId>/<uuid>.<ext>
 * ```
 *
 * **为什么不新增一个 `MUSIC_PATH` 环境变量**：数据库文件和音乐文件是同一类东西——
 * 都必须活过部署。线上数据库在 `/opt/nexus-os/shared/data/nexus-os.db`，音乐跟着落在
 * `shared/data/music/`，天然就在持久卷上；而多一个环境变量，就多一个「线上忘了加」的
 * 失败点，而那个失败点的表现是「上传成功、刷新就没了」这种极难查的样子。
 *
 * 本地不设 `DATABASE_PATH` 时数据库在 `data/nexus-os.db`，音乐就在 `data/music/`。
 */

/** 请求体超过上限：要和「文件坏了」区分开，前端给的文案不同。 */
export class TrackTooLargeError extends Error {
  constructor() {
    super("track too large");
    this.name = "TrackTooLargeError";
  }
}

/**
 * 由数据库路径推导音乐目录（纯函数，便于测试）。
 *
 * 内存库（测试）返回 `null`：它没有「所在目录」这件事，硬推导会把音乐写进当前工作目录。
 * 调用方拿到 `null` 应该视为「这个环境不支持存音乐」，而不是兜底到 `.`。
 */
export function musicRootFor(databasePath: string): string | null {
  if (databasePath === ":memory:" || databasePath.trim() === "") return null;
  return path.join(path.dirname(databasePath), "music");
}

/** 当前进程应使用的音乐根目录；内存库环境下抛错（生产与开发都不会走到）。 */
export function resolveMusicRoot(): string {
  const root = musicRootFor(resolveDatabasePath());
  if (!root) {
    throw new Error("内存数据库没有音乐目录：该操作只在文件库下可用");
  }
  return root;
}

/** 一个用户的曲库目录。userId 是自增整数，不可能是 `..`，但仍然显式转成字符串。 */
export function userMusicDir(root: string, userId: number): string {
  return path.join(root, String(userId));
}

/**
 * 把请求体写成一个文件，边写边数字节数。
 *
 * 只信 `Content-Length` 是不够的：它可以缺席（chunked），也可以是假的（写小、发大）。
 * 所以体积的最终判据是**实际收到的字节数**，超了就在流里中断并清掉半截文件——
 * 留给下一次的是一个干净的目录，而不是一个 200 MB 的残缺文件。
 */
export async function writeTrackBody(
  body: ReadableStream<Uint8Array> | null,
  destPath: string,
  maxBytes = MAX_TRACK_BYTES,
): Promise<number> {
  if (!body) throw new TrackTooLargeError();

  await mkdir(path.dirname(destPath), { recursive: true });

  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        callback(new TrackTooLargeError());
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      counter,
      createWriteStream(destPath),
    );
  } catch (error) {
    // 半截文件不许留：调用方据此只处理「干净的成功或干净的失败」
    await removeTrackFile(destPath);
    throw error;
  }

  return received;
}

/** 删一个文件；不存在、权限不足都不算错误。 */
export async function removeTrackFile(filePath: string): Promise<void> {
  try {
    await rm(filePath, { force: true });
  } catch {
    // 删不掉只留垃圾文件，不影响任何可见行为
  }
}

/** 文件是否存在、多大。找不到返回 null（库里有一行但文件没了，界面该显示异常而不是崩）。 */
export async function statTrackFile(filePath: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const info = await stat(filePath);
    return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : null;
  } catch {
    return null;
  }
}

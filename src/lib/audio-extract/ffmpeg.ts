import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import type { OutputPlan } from "./plan-output";
import { parseProbe, type ProbeResult } from "./probe";
import {
  FFMPEG_TIMEOUT_MS,
  MAX_FILE_BYTES,
  TEMP_DIR_NAME,
  TEMP_ORPHAN_MS,
  TRANSCODE_BITRATE,
} from "./constants";

/**
 * 服务器端的 ffmpeg 操作（只在 Route Handler 里用，客户端不许 import）。
 *
 * 二进制来自 npm 包 `@ffmpeg-installer/ffmpeg`，不是系统里的 `ffmpeg` 命令：
 * 线上机器（Alibaba Cloud Linux 3）的软件源里没有 ffmpeg，装不上；而 npm 包把
 * 各平台的二进制一起发布，构建时跟着产物走，服务器上不需要联网装任何东西。
 */

/** 请求体超过上限：要和「ffmpeg 报错」区分开，前端给的是不同的文案。 */
export class TooLargeError extends Error {
  constructor() {
    super("file too large");
    this.name = "TooLargeError";
  }
}

/** ffmpeg 执行失败（保留了最后一行 stderr，排障时用）。 */
export class FfmpegError extends Error {
  constructor(message: string, readonly detail: string) {
    super(message);
    this.name = "FfmpegError";
  }
}

/** 临时目录：`<系统 tmp>/nexus-os-audio`。 */
export function tempDir(): string {
  return join(tmpdir(), TEMP_DIR_NAME);
}

/** 建目录（已存在不报错）。 */
export async function ensureTempDir(): Promise<string> {
  const dir = tempDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 清掉超过 1 小时的残留文件。
 *
 * 正常情况下每个请求都在 `finally` 里删掉自己的文件；这一条兜的是
 * 「进程被杀 / 机器重启」那种 `finally` 跑不到的情况。任何异常都不许冒泡——
 * 清理失败不该让一次提取失败。
 */
export async function sweepOrphans(dir: string): Promise<void> {
  try {
    const now = Date.now();
    const names = await readdir(dir);
    await Promise.all(
      names.map(async (name) => {
        const full = join(dir, name);
        try {
          const info = await stat(full);
          if (now - info.mtimeMs > TEMP_ORPHAN_MS) await rm(full, { force: true });
        } catch {
          // 单个文件读不到就跳过，不打断整轮扫描
        }
      }),
    );
  } catch {
    // 目录还不存在等情况：忽略
  }
}

/** 删文件，不抛异常。 */
export async function removeQuietly(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // 删不掉也不影响用户拿到结果
  }
}

/**
 * 把请求体流式写进临时文件，返回实际字节数。
 *
 * **绝不 `await request.arrayBuffer()`**：服务器只有 1.8 GB 内存，
 * 一个 500 MB 的视频读进内存会让整个 Next 进程被系统杀掉，连带所有页面。
 * 这里边写边数，一超上限就中断，写了一半的文件由调用方删。
 */
export async function writeBodyToFile(
  body: ReadableStream<Uint8Array> | null,
  filePath: string,
): Promise<number> {
  if (!body) throw new TooLargeError();

  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_FILE_BYTES) {
        callback(new TooLargeError());
        return;
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
    counter,
    createWriteStream(filePath),
  );
  return received;
}

/** 跑一次 ffmpeg，返回 stderr（并发超时保护）。 */
function run(args: string[]): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new FfmpegError("ffmpeg 超时", stderr.slice(-500)));
    }, FFMPEG_TIMEOUT_MS);

    // stderr 只需要最后一段（报错就一两行，探测也只需要流信息）
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new FfmpegError("ffmpeg 启动失败", String(error)));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/**
 * 读出第一条音轨的编码与时长。
 *
 * **不能按退出码判失败**：只给 `-i` 不给输出文件时，ffmpeg 打印完流信息就以 1 退出。
 * 判据是「解析结果里有没有流」。
 */
export async function probeFile(filePath: string): Promise<ProbeResult> {
  const { stderr } = await run(["-hide_banner", "-nostdin", "-i", filePath]);
  return parseProbe(stderr);
}

/**
 * 提取音频。
 *
 * 参数里每一段都有理由（《功能/音频提取》§七）：
 * - `-nostdin`：子进程没有 TTY 时 ffmpeg 会去读 stdin 等交互，**永远不返回**；
 * - `-y`：输出文件已存在时直接覆盖，不留交互；
 * - `-vn -sn -dn`：视频、字幕、章节流一律不要，只留音频；
 * - `-map 0:a:0`：多条音轨只要第一条；
 * - 拷贝路径 `-c:a copy` 一次解码都不做；转码路径只编 AAC（内置编码器，不需要外部库）。
 */
export async function extractAudio(
  inputPath: string,
  outputPath: string,
  plan: OutputPlan,
): Promise<void> {
  const args = [
    "-hide_banner",
    "-nostdin",
    "-y",
    "-loglevel",
    "error",
    "-i",
    inputPath,
    "-vn",
    "-sn",
    "-dn",
    "-map",
    "0:a:0",
  ];

  if (plan.mode === "copy") {
    args.push("-c:a", "copy");
  } else {
    args.push("-c:a", "aac", "-b:a", TRANSCODE_BITRATE);
  }
  args.push(outputPath);

  const { code, stderr } = await run(args);
  if (code !== 0) {
    throw new FfmpegError("提取失败", stderr.slice(-500));
  }
}

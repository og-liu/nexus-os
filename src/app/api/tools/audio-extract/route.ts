import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { getCurrentUser } from "@/lib/auth/current-user";
import { MAX_FILE_BYTES, type ExtractErrorCode } from "@/lib/audio-extract/constants";
import {
  TooLargeError,
  ensureTempDir,
  extractAudio,
  probeFile,
  removeQuietly,
  sweepOrphans,
  writeBodyToFile,
} from "@/lib/audio-extract/ffmpeg";
import { contentDisposition } from "@/lib/content-disposition";
import { outputFilename } from "@/lib/audio-extract/filename";
import { planOutput } from "@/lib/audio-extract/plan-output";

/**
 * 音频提取接口（《功能/音频提取》§四）。
 *
 * 这是全站第一条**会读用户上传文件**的接口，形状和 `api/chat` 不同：
 * 请求体是原始字节（不是 JSON、不是 multipart），响应体是音频文件本身。
 * 三件事在这里定死：
 *
 * 1. **鉴权**：页面 `requireUser()` 管不住直接 POST 这个接口的人，所以这里再验一次。
 * 2. **体积**：先看 `Content-Length`，再在流式写盘时边写边数——两道都要，
 *    因为 `Content-Length` 可以是假的，也可以根本没有（chunked）。
 * 3. **临时文件**：输入写完立刻用完，输出在响应流结束后删；任何异常路径都不许留残留。
 */

// better-sqlite3 与 child_process 都要求 Node 运行时（不能用 Edge）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(code: ExtractErrorCode, message: string, status: number): Response {
  return Response.json({ code, error: message }, { status });
}

/** 从自定义请求头取原始文件名；解码失败就用兜底名。 */
function readFileName(request: Request): string {
  const raw = request.headers.get("x-file-name");
  if (!raw) return "video";
  try {
    return decodeURIComponent(raw);
  } catch {
    return "video";
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return fail("unauthorized", "请先登录", 401);
  }

  // 第一道体积检查：声明值超了就不用开始收包
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) {
    return fail("too-large", "文件超过 500 MB", 413);
  }

  const dir = await ensureTempDir();
  // 顺手收掉上次异常退出留下的孤儿文件（超过 1 小时的）
  await sweepOrphans(dir);

  const id = randomUUID();
  const inputPath = join(dir, `${id}.upload`);
  let outputPath: string | null = null;

  try {
    // 第二道体积检查：边收边数，超了在流里就中断
    try {
      await writeBodyToFile(request.body, inputPath);
    } catch (error) {
      if (error instanceof TooLargeError) {
        return fail("too-large", "文件超过 500 MB", 413);
      }
      throw error;
    }

    // 探测：认不出任何流 = 打不开；有流但没有音频 = 没有音轨
    const probe = await probeFile(inputPath);
    if (!probe.hasAnyStream) {
      return fail("unreadable", "这个视频打不开", 400);
    }
    if (!probe.codec) {
      return fail("no-audio", "这个视频没有声音", 422);
    }

    const plan = planOutput(probe.codec);
    outputPath = join(dir, `${id}${plan.extension}`);

    try {
      await extractAudio(inputPath, outputPath, plan);
    } catch {
      return fail("extract-failed", "提取失败了，换一个视频试试", 500);
    }

    const { size } = await stat(outputPath);
    const fileName = outputFilename(readFileName(request), plan.extension);

    const stream = createReadStream(outputPath);
    // 响应流结束后再删：提前删会让用户下到一半的文件被截断
    stream.on("close", () => void removeQuietly(outputPath as string));
    stream.on("error", () => void removeQuietly(outputPath as string));

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": plan.mime,
        "Content-Length": String(size),
        "Content-Disposition": contentDisposition(fileName),
        "Cache-Control": "no-store",
        // 让前端不必再猜：处理方式、源编码、时长都随响应回来
        "X-Audio-Mode": plan.mode,
        "X-Audio-Source": probe.codec,
        "X-Audio-Duration": probe.durationSec === null ? "" : String(probe.durationSec),
      },
    });
  } catch {
    // 兜底：走到这里说明是没预料到的错误（磁盘满、权限等），也给一句人话
    if (outputPath) await removeQuietly(outputPath);
    return fail("extract-failed", "服务器处理失败了，稍后再试", 500);
  } finally {
    // 输入文件无论成功失败都用完了；输出文件由上面的流回调负责删
    await removeQuietly(inputPath);
  }
}

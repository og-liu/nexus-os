import { spawn } from "node:child_process";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { parseProbe, type ProbeResult } from "@/lib/audio-extract/probe";
import { cleanTag } from "./formats";

/**
 * 上传时探一条音频：真实编码、时长、以及文件自带的 title / artist 标签。
 *
 * 复用音频提取的 `parseProbe` 读流信息——它解析的是 **ffmpeg 自己打印的格式**，
 * 跟业务无关，是纯函数。把正则抄一份到这里，下一次 ffmpeg 换输出格式就得改两处。
 *
 * 一样的两个坑（《功能/音频提取》§七）：只给 `-i` 不给输出文件时 ffmpeg 退出码是 1，
 * 不能按退出码判失败；输出在 stderr 上。
 */

export interface AudioProbe extends ProbeResult {
  /** 文件自带的标题标签（已清洗）；没有或乱码时为 null */
  title: string | null;
  /** 文件自带的歌手标签（已清洗）；没有时为 null */
  artist: string | null;
}

/**
 * 从 ffmpeg 的输出里取文件级标签。
 *
 * 一段真实的输出长这样：
 *   Input #0, mp3, from 'a.mp3':
 *     Metadata:
 *       title           : 晴天
 *       artist          : 周杰伦
 *     Duration: 00:04:29.12, start: 0.000000, bitrate: 320 kb/s
 *
 * 取**第一个**匹配：文件级 Metadata 排在所有 `Stream #` 之前，后面每条流若也带标签
 * 会再次出现同名行，那时取到的是某条流的标签，不是文件的。
 */
const TAG_LINE = /^\s+(title|artist)\s*:\s*(.+)$/gim;

export function parseTags(stderr: string): { title: string | null; artist: string | null } {
  const found: { title: string | null; artist: string | null } = {
    title: null,
    artist: null,
  };

  // 只看第一条流之前的片段：标签属于「文件」还是「某条流」，靠位置区分
  const firstStream = stderr.search(/Stream #\d+:\d+/);
  const head = firstStream === -1 ? stderr : stderr.slice(0, firstStream);

  for (const match of head.matchAll(TAG_LINE)) {
    const key = match[1].toLowerCase() as "title" | "artist";
    if (found[key] === null) found[key] = cleanTag(match[2]);
  }

  return found;
}

/** ffmpeg 探测的硬超时：正常几十毫秒，卡住说明文件有问题。 */
const PROBE_TIMEOUT_MS = 15_000;

/** 跑一次 `ffmpeg -i`，收集 stderr。超时或起不来都返回空串（= 打不开）。 */
function runProbe(filePath: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-nostdin", "-i", filePath], {
      stdio: ["ignore", "ignore", "pipe"],
    });

    const chunks: Buffer[] = [];
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, PROBE_TIMEOUT_MS);

    const finish = () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    };

    // 只给 -i 时退出码必是 1，这里不看它 —— 能收到什么就用什么
    child.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
    child.on("close", finish);
  });
}

/** 探一条音频；打不开时 `hasAnyStream` 为 false，调用方据此拒掉。 */
export async function probeAudioFile(filePath: string): Promise<AudioProbe> {
  const stderr = await runProbe(filePath);
  const base = parseProbe(stderr);
  const tags = parseTags(stderr);

  return {
    ...base,
    title: tags.title,
    artist: tags.artist,
  };
}

/** faststart 重排的硬超时：46MB 重排约 1 秒，卡住说明磁盘或文件有问题。 */
const FASTSTART_TIMEOUT_MS = 60_000;

/**
 * 把 MP4 系容器的元数据（`moov`）挪到**文件开头**（`-movflags +faststart`）。
 *
 * **为什么必须做**（2026-11-04 线上事故）：M4A 的 `moov`（时长、seek 表）默认在
 * **文件末尾**。46MB 的音频，浏览器要下完整个文件才知道多长、能不能 seek——
 * 线上实测 7 秒只下了 532KB，`readyState` 一直是 0：位置恢复不了、歌也播不起来。
 * 把 `moov` 提到文件头之后，浏览器下几 KB 就能拿到时长并直接从任意位置取流。
 *
 * `-c copy` **不转码**，只重排 atom（体积几乎不变），符合「原样存」的原则。
 * 失败不抛给调用方——用它返回 false，调用方退回原文件（能播，只是大文件 seek 慢）。
 */
export function faststartCopy(inputPath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(
      ffmpegPath,
      [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-c",
        "copy",
        // 输出名是 `<临时文件名>.faststart`，没有 `.m4a` 后缀——ffmpeg 猜不出容器，
        // 会报 "Unable to find a suitable output format" 然后我们静默退回原文件。
        // 显式点名 ipod（M4A 的 muxer）最稳。
        "-f",
        "ipod",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { stdio: ["ignore", "ignore", "ignore"] },
    );

    const timer = setTimeout(() => child.kill("SIGKILL"), FASTSTART_TIMEOUT_MS);

    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

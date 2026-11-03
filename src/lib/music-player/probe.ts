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

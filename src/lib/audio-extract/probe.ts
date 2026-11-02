/**
 * 从 `ffmpeg -i <文件>` 的输出里读出「有没有音轨、是什么编码、多长」（纯函数）。
 *
 * 为什么不用 ffprobe：ffprobe 只有单独的二进制，而 npm 包里只带 ffmpeg。
 * 多引一个 68 MB 的二进制只为读三行文本不划算，所以直接解析 ffmpeg 打印的流信息。
 *
 * 两个必须知道的点（《功能/音频提取》§七）：
 * 1. **只给 `-i` 不给输出文件时，ffmpeg 的退出码是 1**——它把这当成「没有输出」的错误。
 *    所以调用方**不能按退出码判失败**，要看解析结果。
 * 2. 输出在 **stderr** 上，不在 stdout。
 */

export interface ProbeResult {
  /** 第一条音轨的编码，如 `aac` / `mp3` / `opus`；没有音轨时为 null */
  codec: string | null;
  /** 时长（秒），`Duration: N/A` 或读不出时为 null */
  durationSec: number | null;
  /** 文件里是否认出了至少一条流——全没有就是「打不开」 */
  hasAnyStream: boolean;
}

/**
 * 一行流信息长这样（不同版本略有差异，括号与方括号都可能缺席）：
 *   Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 85 kb/s (default)
 *   Stream #0:1[0x2](und): Audio: opus, 48000 Hz, stereo, fltp (default)
 *   Stream #0:1: Audio: mp3, 44100 Hz, stereo, 128 kb/s
 */
const AUDIO_STREAM = /Stream #\d+:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?:\s*Audio:\s*([A-Za-z0-9_]+)/;
const ANY_STREAM = /Stream #\d+:\d+/;
const DURATION = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/;

/** 解析 `ffmpeg -i` 的 stderr。认不出的部分返回 null，不抛异常。 */
export function parseProbe(stderr: string): ProbeResult {
  const audio = stderr.match(AUDIO_STREAM);
  const duration = stderr.match(DURATION);

  let durationSec: number | null = null;
  if (duration) {
    const hours = Number(duration[1]);
    const minutes = Number(duration[2]);
    const seconds = Number(duration[3]);
    const total = hours * 3600 + minutes * 60 + seconds;
    durationSec = Number.isFinite(total) ? total : null;
  }

  return {
    codec: audio ? audio[1].toLowerCase() : null,
    durationSec,
    hasAnyStream: ANY_STREAM.test(stderr),
  };
}

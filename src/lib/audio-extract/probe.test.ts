import { describe, expect, it } from "vitest";
import { parseProbe } from "./probe";

/** 真实 ffmpeg 4.4 的输出片段（只留要解析的那几行）。 */
const AAC_MP4 = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'aac.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:00:04.00, start: 0.000000, bitrate: 135 kb/s
  Stream #0:0(und): Video: h264 (High 4:4:4 Predictive) (avc1 / 0x31637661), yuv444p, 320x240, 40 kb/s, 25 fps
  Stream #0:1(und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 85 kb/s (default)
At least one output file must be specified
`;

describe("parseProbe（从 ffmpeg 的 stderr 读流信息）", () => {
  it("读出音轨编码与时长", () => {
    expect(parseProbe(AAC_MP4)).toEqual({
      codec: "aac",
      durationSec: 4,
      hasAnyStream: true,
    });
  });

  it("带 stream id 方括号、没有语言括号的写法也认", () => {
    const opus = `  Stream #0:1[0x2](und): Audio: opus, 48000 Hz, stereo, fltp (default)`;
    expect(parseProbe(opus).codec).toBe("opus");

    const plain = `  Stream #0:1: Audio: mp3, 44100 Hz, stereo, 128 kb/s`;
    expect(parseProbe(plain).codec).toBe("mp3");
  });

  it("只有画面没有声音：codec 为 null，但仍是「认得出的文件」", () => {
    const silent = AAC_MP4.replace(/^\s*Stream #0:1.*$/gm, "");
    const result = parseProbe(silent);
    expect(result.codec).toBeNull();
    expect(result.hasAnyStream).toBe(true);
  });

  it("完全认不出（损坏文件 / 不是媒体文件）：hasAnyStream 为 false", () => {
    const broken = "aac.mp4: Invalid data found when processing input\n";
    expect(parseProbe(broken)).toEqual({
      codec: null,
      durationSec: null,
      hasAnyStream: false,
    });
  });

  it("时长跨小时；Duration: N/A 时不瞎猜", () => {
    expect(parseProbe("  Duration: 01:02:03.50, start: 0.000000, bitrate: 900 kb/s").durationSec).toBe(
      3723.5,
    );
    expect(parseProbe("  Duration: N/A, bitrate: N/A").durationSec).toBeNull();
  });

  it("多条音轨时取第一条（只输出第一条音轨）", () => {
    const two = `  Stream #0:1: Audio: aac, 44100 Hz, stereo
  Stream #0:2: Audio: ac3, 48000 Hz, 5.1`;
    expect(parseProbe(two).codec).toBe("aac");
  });
});

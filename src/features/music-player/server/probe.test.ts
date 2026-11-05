import { describe, expect, it } from "vitest";
import { parseTags } from "./probe";

/**
 * 用的是 ffmpeg 真实输出片段（不同版本的空格数、有无 `Input #0, mp3, from` 都见过），
 * 不跑二进制——真二进制在门禁里跑一次要几百毫秒，而这里验的是解析。
 */
const MP3_WITH_TAGS = `
Input #0, mp3, from 'a.mp3':
  Metadata:
    title           : 晴天
    artist          : 周杰伦
    album           : 叶惠美
  Duration: 00:04:29.12, start: 0.000000, bitrate: 320 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
    Metadata:
      title         : 流级别的标题
`;

const FLAC_NO_TAGS = `
Input #0, flac, from 'b.flac':
  Duration: 00:03:10.00, start: 0.000000, bitrate: 900 kb/s
  Stream #0:0: Audio: flac, 44100 Hz, stereo, s16
`;

const GARBLED = `
Input #0, mp3, from 'c.mp3':
  Metadata:
    title           : ����
    artist          : ��
  Duration: 00:02:00.00, start: 0.000000, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, mono, fltp, 128 kb/s
`;

describe("probe.parseTags（features/music-player/README.md §四「时长怎么来」）", () => {
  it("取到文件级 title 与 artist，不取流级别的同名标签", () => {
    expect(parseTags(MP3_WITH_TAGS)).toEqual({ title: "晴天", artist: "周杰伦" });
  });

  it("没有标签时两列都是 null（歌名回退文件名）", () => {
    expect(parseTags(FLAC_NO_TAGS)).toEqual({ title: null, artist: null });
  });

  it("乱码标签当没有，界面回退文件名而不是显示一排替换字符", () => {
    expect(parseTags(GARBLED)).toEqual({ title: null, artist: null });
  });

  it("认不出的输出不抛异常", () => {
    expect(parseTags("")).toEqual({ title: null, artist: null });
    expect(parseTags("随便一段文字")).toEqual({ title: null, artist: null });
  });
});

import { describe, expect, it } from "vitest";
import { contentRangeHeader, parseRange } from "./range";

describe("range（《功能/音乐播放器》§七第 2 条）", () => {
  const SIZE = 1000;

  it("没有 Range 头时回全量", () => {
    expect(parseRange(null, SIZE)).toBeNull();
    expect(parseRange("", SIZE)).toBeNull();
  });

  it("bytes=0- 是 Safari 的开场请求，必须回 0..size-1", () => {
    expect(parseRange("bytes=0-", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("闭区间两端都在范围内", () => {
    expect(parseRange("bytes=100-200", SIZE)).toEqual({ start: 100, end: 200 });
  });

  it("只给起点时到文件末尾", () => {
    expect(parseRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("只要末尾 N 字节", () => {
    expect(parseRange("bytes=-100", SIZE)).toEqual({ start: 900, end: 999 });
    expect(parseRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("右端点超出文件末尾时截断（播放器常发比文件大的值）", () => {
    expect(parseRange("bytes=900-99999", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("不认识的写法一律当没写，回全量而不是 416", () => {
    expect(parseRange("bytes=0-100,200-300", SIZE)).toBeNull();
    expect(parseRange("items=0-100", SIZE)).toBeNull();
    expect(parseRange("bytes=200-100", SIZE)).toBeNull();
    expect(parseRange("bytes=-", SIZE)).toBeNull();
    expect(parseRange("bytes=abc-def", SIZE)).toBeNull();
  });

  it("起点超出文件末尾时没有可给的内容", () => {
    expect(parseRange("bytes=1000-", SIZE)).toBeNull();
    expect(parseRange("bytes=5000-6000", SIZE)).toBeNull();
  });

  it("空文件不接受任何 Range", () => {
    expect(parseRange("bytes=0-", 0)).toBeNull();
  });

  it("Content-Range 头按闭区间写", () => {
    expect(contentRangeHeader({ start: 100, end: 200 }, SIZE)).toBe("bytes 100-200/1000");
  });
});

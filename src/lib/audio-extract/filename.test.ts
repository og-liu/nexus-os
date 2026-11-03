import { describe, expect, it } from "vitest";
import { contentDisposition } from "../content-disposition";
import { outputFilename, stripExtension } from "./filename";

describe("outputFilename（输出文件名清洗）", () => {
  it("普通名字：只换扩展名", () => {
    expect(outputFilename("周杰伦-晴天.mp4", ".m4a")).toBe("周杰伦-晴天.m4a");
    expect(outputFilename("song.MP4", ".mp3")).toBe("song.mp3");
  });

  it("中文与 emoji 保留，井号与路径分隔符换成 -", () => {
    expect(outputFilename("抖音_❤️测试#1.mp4", ".m4a")).toBe("抖音_❤️测试-1.m4a");
    expect(outputFilename("a/b\\c:d*e?f\"g<h>i|j.mp4", ".m4a")).toBe("a-b-c-d-e-f-g-h-i-j.m4a");
  });

  it("路径穿越被压平（不会拼出 ../ 这类东西）", () => {
    expect(outputFilename("../../../etc/passwd.mp4", ".m4a")).toBe("etc-passwd.m4a");
  });

  it("文件名里本来就有多个点：只去掉最后一个扩展名", () => {
    expect(outputFilename("live.2026.11.02.mp4", ".m4a")).toBe("live.2026.11.02.m4a");
  });

  it("清完什么都不剩时退回 audio，不产出以点开头的隐藏文件", () => {
    expect(outputFilename("###.mp4", ".m4a")).toBe("audio.m4a");
    expect(outputFilename("   ", ".m4a")).toBe("audio.m4a");
  });

  it("stripExtension：没有扩展名或扩展名在开头时原样返回", () => {
    expect(stripExtension("noext")).toBe("noext");
    expect(stripExtension(".hidden")).toBe(".hidden");
  });
});

describe("contentDisposition（RFC 5987）", () => {
  it("同时给 ASCII 兜底名与 UTF-8 真名", () => {
    const value = contentDisposition("晴天.m4a");
    expect(value).toContain('filename="__.m4a"');
    expect(value).toContain("filename*=UTF-8''%E6%99%B4%E5%A4%A9.m4a");
  });

  it("名字里的引号不会把 header 值截断", () => {
    const value = contentDisposition('a"b.m4a');
    expect(value).not.toMatch(/filename="a"b/);
  });
});

import { describe, expect, it } from "vitest";
import { contentDisposition, stripLoneSurrogates } from "./content-disposition";

describe("stripLoneSurrogates（孤立代理项清洗）", () => {
  it("完整 emoji 原样保留", () => {
    expect(stripLoneSurrogates("a🐯b")).toBe("a🐯b");
  });

  it("孤立的高代理项被删掉", () => {
    expect(stripLoneSurrogates("a\uD83Db")).toBe("ab");
  });

  it("孤立的低代理项被删掉", () => {
    expect(stripLoneSurrogates("a\uDE00b")).toBe("ab");
  });
});

describe("contentDisposition（RFC 5987）", () => {
  it("中文名走 filename* 百分号编码，同时给一个 ASCII 兜底", () => {
    const value = contentDisposition("晴天.mp4");
    expect(value).toContain('filename="__.mp4"');
    expect(value).toContain(`filename*=UTF-8''${encodeURIComponent("晴天.mp4")}`);
  });

  it("标题里带孤立代理项也不抛错（实测踩过：这里抛错会让下载接口 500）", () => {
    const value = contentDisposition("标题\uD83D.mp4");
    expect(value).toContain("filename*=UTF-8''");
    expect(() => contentDisposition("\uD83D")).not.toThrow();
  });
});

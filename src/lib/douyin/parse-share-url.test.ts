import { describe, expect, it } from "vitest";
import { parseShareText } from "./parse-share-url";

describe("parseShareText（从分享文案里抠链接）", () => {
  it("整段分享文案：抠出短链，不带 id", () => {
    const text =
      "7.43 pda:/ 复制此链接，打开抖音搜索，直接观看视频！ https://v.douyin.com/53daiZW3xXc/ 复制此链接";
    expect(parseShareText(text)).toEqual({
      url: "https://v.douyin.com/53daiZW3xXc/",
      awemeId: null,
    });
  });

  it("纯短链原样返回", () => {
    expect(parseShareText("https://v.douyin.com/abc123/")).toEqual({
      url: "https://v.douyin.com/abc123/",
      awemeId: null,
    });
  });

  it("长链自带作品 id", () => {
    const text = "看看这个 https://www.douyin.com/video/7702813136873757106 挺好";
    expect(parseShareText(text)).toEqual({
      url: "https://www.douyin.com/video/7702813136873757106",
      awemeId: "7702813136873757106",
    });
  });

  it("iesdouyin 分享页也认，并取出 id", () => {
    const text = "https://www.iesdouyin.com/share/video/7198838707233869108/?region=CN&mid=1";
    expect(parseShareText(text)).toEqual({
      url: "https://www.iesdouyin.com/share/video/7198838707233869108/",
      awemeId: "7198838707233869108",
    });
  });

  it("长链与短链同时出现时优先长链（自带 id，少一次重定向）", () => {
    const text =
      "https://v.douyin.com/abc123/ 和 https://www.douyin.com/video/7702813136873757106";
    expect(parseShareText(text)?.awemeId).toBe("7702813136873757106");
  });

  it("空字符串返回 null", () => {
    expect(parseShareText("")).toBeNull();
    expect(parseShareText("   ")).toBeNull();
  });

  it("别的站点认不出来（不能把任意链接当抖音链接去解析）", () => {
    expect(parseShareText("https://www.bilibili.com/video/BV1xx411c7mD")).toBeNull();
    expect(parseShareText("https://example.com/v.douyin.com/")).toBeNull();
  });
});

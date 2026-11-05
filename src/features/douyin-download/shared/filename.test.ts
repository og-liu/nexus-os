import { describe, expect, it } from "vitest";
import { toVideoFilename } from "./filename";

describe("toVideoFilename（标题 → 文件名）", () => {
  it("普通中文标题原样保留", () => {
    expect(toVideoFilename("村里办酒席", "7702813136873757106")).toBe("村里办酒席.mp4");
  });

  it("话题井号换成 -（井号在 URL 里是片段分隔符）", () => {
    expect(toVideoFilename("万圣节 #成都兰桂坊", "1")).toBe("万圣节 -成都兰桂坊.mp4");
  });

  it("emoji 保留", () => {
    expect(toVideoFilename("🐯哈库拉", "1")).toBe("🐯哈库拉.mp4");
  });

  it("文件系统非法字符全部换掉", () => {
    expect(toVideoFilename('a/b\\c:d*e?f"g<h>i|j', "1")).toBe("a-b-c-d-e-f-g-h-i-j.mp4");
  });

  it("空白收成一个空格、首尾修剪", () => {
    expect(toVideoFilename("  多个   空格  ", "1")).toBe("多个 空格.mp4");
  });

  it("标题为空时退回作品 id", () => {
    expect(toVideoFilename("", "7702813136873757106")).toBe("douyin-7702813136873757106.mp4");
    expect(toVideoFilename("   ", "123")).toBe("douyin-123.mp4");
  });

  it("全是非法字符时也退回作品 id（不能只剩一串横线）", () => {
    expect(toVideoFilename("///", "123")).toBe("douyin-123.mp4");
  });

  it("超长标题截断到 60 个字符", () => {
    const name = toVideoFilename("一".repeat(80), "1");
    expect(name).toBe(`${"一".repeat(60)}.mp4`);
  });

  it("孤立代理项被清掉（半个 emoji 会让 encodeURIComponent 抛 URIError）", () => {
    // 高代理项后面没有低代理项配对
    expect(toVideoFilename("标题\uD83D", "1")).toBe("标题.mp4");
    // 整个标题只有半个 emoji → 退回作品 id
    expect(toVideoFilename("\uD83D", "1")).toBe("douyin-1.mp4");
  });

  it("截断正好切在 emoji 中间时，不留下凭空产生的半个代理项", () => {
    // 59 个 a + 🐯（占两个码元）= 61 码元；slice(0, 60) 只留下 emoji 的高代理项。
    // 原始标题本身没有任何孤立项，是「先截断后清洗」的顺序造成的。
    const name = toVideoFilename(`${"a".repeat(59)}🐯尾巴`, "1");
    expect(name).toBe(`${"a".repeat(59)}.mp4`);
    expect(() => encodeURIComponent(name)).not.toThrow();
  });

  it("截断后不以点或横线结尾", () => {
    const name = toVideoFilename(`${"一".repeat(59)}/尾巴`, "1");
    expect(name.endsWith("-.mp4")).toBe(false);
    expect(name.endsWith(".mp4")).toBe(true);
  });
});

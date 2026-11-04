import { describe, expect, it } from "vitest";
import { importTitleFromFileName, isMarkdownFileName, nextAvailableTitle } from "./import";
import { TITLE_MAX, UNTITLED } from "./validate";

describe("导入：文件名过滤", () => {
  it("认 .md / .markdown，大小写不敏感", () => {
    expect(isMarkdownFileName("周报.md")).toBe(true);
    expect(isMarkdownFileName("周报.MD")).toBe(true);
    expect(isMarkdownFileName("周报.MarkDown")).toBe(true);
  });

  it("其它扩展名、双扩展名、没有扩展名都不算", () => {
    expect(isMarkdownFileName("周报.txt")).toBe(false);
    expect(isMarkdownFileName("周报.md.txt")).toBe(false);
    expect(isMarkdownFileName("README")).toBe(false);
    expect(isMarkdownFileName("图片.png")).toBe(false);
  });
});

describe("导入：文件名 → 标题", () => {
  it("去掉最后一个扩展名（中间的点保留）", () => {
    expect(importTitleFromFileName("周报.md")).toBe("周报");
    expect(importTitleFromFileName("v1.2 说明.markdown")).toBe("v1.2 说明");
    expect(importTitleFromFileName("a.b.md")).toBe("a.b");
  });

  it("去掉两端空白", () => {
    expect(importTitleFromFileName("  周报  .md")).toBe("周报");
  });

  it("超过 60 字截断（汉字按 1 个算）", () => {
    const long = "汉".repeat(TITLE_MAX + 5);
    expect(Array.from(importTitleFromFileName(`${long}.md`)).length).toBe(TITLE_MAX);
  });

  it("没有名字时（` .md`）兜底「未命名文档」", () => {
    expect(importTitleFromFileName(" .md")).toBe(UNTITLED);
  });
});

describe("导入：撞名补序号", () => {
  it("不撞名原样返回", () => {
    expect(nextAvailableTitle("周报", new Set())).toBe("周报");
  });

  it("撞一次补 2、撞两次补 3", () => {
    expect(nextAvailableTitle("周报", new Set(["周报"]))).toBe("周报 2");
    expect(nextAvailableTitle("周报", new Set(["周报", "周报 2"]))).toBe("周报 3");
  });

  it("中间的号空着就用它（「周报 2」被删过）", () => {
    expect(nextAvailableTitle("周报", new Set(["周报", "周报 3"]))).toBe("周报 2");
  });

  it("补序号后仍守 60 字：基础名让位给序号", () => {
    const long = "汉".repeat(TITLE_MAX);
    const result = nextAvailableTitle(long, new Set([long]));
    expect(Array.from(result).length).toBe(TITLE_MAX);
    expect(result.endsWith(" 2")).toBe(true);
  });
});

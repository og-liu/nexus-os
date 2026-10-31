import { describe, expect, it } from "vitest";
import {
  BODY_MAX,
  TITLE_MAX,
  UNTITLED,
  charCount,
  validateBody,
  validateId,
  validateTitle,
} from "./validate";

/**
 * 校验用例（《功能/Markdown编辑器》§六 验收 20–21、§六 验收 30）。
 *
 * 边界值两边都要测：`TITLE_MAX` 字能过、`TITLE_MAX + 1` 字被拒。
 * 只测「能过」会漏掉一个上界少一的错，只测「被拒」会漏掉把上限写小的错。
 */

describe("标题校验", () => {
  it("空、纯空格、纯换行都变成「未命名文档」，不报错", () => {
    expect(validateTitle("")).toEqual({ ok: true, value: UNTITLED });
    expect(validateTitle("   ")).toEqual({ ok: true, value: UNTITLED });
    expect(validateTitle("\n\t ")).toEqual({ ok: true, value: UNTITLED });
  });

  it("两头空格修掉，中间不动", () => {
    expect(validateTitle("  周报 ")).toEqual({ ok: true, value: "周报" });
  });

  it(`边界 ${TITLE_MAX} 字可以，${TITLE_MAX + 1} 字拒绝（按字符数，不按 UTF-16 长度）`, () => {
    expect(validateTitle("あ".repeat(TITLE_MAX)).ok).toBe(true);
    expect(validateTitle("あ".repeat(TITLE_MAX + 1)).ok).toBe(false);

    // emoji 在 JS 里 length 是 2，按字符数算才对
    const emoji = "📝";
    expect(emoji.repeat(TITLE_MAX).length).toBe(TITLE_MAX * 2);
    expect(validateTitle(emoji.repeat(TITLE_MAX)).ok).toBe(true);
    expect(validateTitle(emoji.repeat(TITLE_MAX + 1)).ok).toBe(false);
  });

  it("非字符串直接拒绝（Server Action 是公开端点，什么都可能传进来）", () => {
    expect(validateTitle(123).ok).toBe(false);
    expect(validateTitle(null).ok).toBe(false);
    expect(validateTitle(undefined).ok).toBe(false);
  });
});

describe("正文校验", () => {
  it("空正文是合法的（新建出来就是空文档）", () => {
    expect(validateBody("")).toEqual({ ok: true, value: "" });
  });

  it("正文不 trim：行首缩进与两头空白都是原文的一部分", () => {
    const raw = "```\n  indented\n```\n";
    expect(validateBody(raw)).toEqual({ ok: true, value: raw });
  });

  it(`边界 ${BODY_MAX} 字符可以，${BODY_MAX + 1} 字符拒绝`, () => {
    expect(validateBody("a".repeat(BODY_MAX)).ok).toBe(true);
    expect(validateBody("a".repeat(BODY_MAX + 1)).ok).toBe(false);
  });

  it("非字符串直接拒绝", () => {
    expect(validateBody(1).ok).toBe(false);
    expect(validateBody(null).ok).toBe(false);
  });
});

describe("id 校验", () => {
  it("只收正整数", () => {
    expect(validateId(7)).toEqual({ ok: true, value: 7 });
    expect(validateId(0).ok).toBe(false);
    expect(validateId(-1).ok).toBe(false);
    expect(validateId(1.5).ok).toBe(false);
    expect(validateId("7").ok).toBe(false);
    expect(validateId(undefined).ok).toBe(false);
  });
});

describe("charCount（状态栏字数）", () => {
  it("中文一字算 1，emoji 记 1 个", () => {
    expect(charCount("中文")).toBe(2);
    expect(charCount("📝")).toBe(1);
    expect(charCount("a📝中")).toBe(3);
  });
});

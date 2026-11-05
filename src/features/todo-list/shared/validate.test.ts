import { describe, expect, it } from "vitest";
import {
  TODO_TITLE_MAX_LENGTH,
  charLength,
  validateTodoTitle,
} from "./validate";

describe("待办标题校验", () => {
  it("普通标题通过，并去掉首尾空白", () => {
    expect(validateTodoTitle("  买牛奶  ")).toEqual({
      ok: true,
      title: "买牛奶",
    });
  });

  it("空串与纯空白都拒绝", () => {
    expect(validateTodoTitle("")).toEqual({
      ok: false,
      error: "待办内容不能为空",
    });
    expect(validateTodoTitle("   \n\t  ").ok).toBe(false);
    // 全角空格（U+3000）骗不过 trim()
    expect(validateTodoTitle("　　").ok).toBe(false);
  });

  it("1000 字通过，1001 字拒绝", () => {
    expect(validateTodoTitle("字".repeat(TODO_TITLE_MAX_LENGTH)).ok).toBe(true);
    expect(validateTodoTitle("字".repeat(TODO_TITLE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: `待办最多 ${TODO_TITLE_MAX_LENGTH} 字`,
    });
  });

  it("先 trim 再判长度：前后空白不计入 1000 字", () => {
    const title = "字".repeat(TODO_TITLE_MAX_LENGTH);
    expect(validateTodoTitle(`  ${title}  `).ok).toBe(true);
  });

  it("按字符数计长度：一个汉字算 1，一个 emoji 也算 1", () => {
    expect(charLength("汉字")).toBe(2);
    expect(charLength("🙂")).toBe(1);
  });
});

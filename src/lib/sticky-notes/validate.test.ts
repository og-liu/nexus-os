import { describe, expect, it } from "vitest";
import {
  NOTE_BODY_MAX_LENGTH,
  charLength,
  validateNoteBody,
} from "./validate";

describe("便签正文校验", () => {
  it("普通正文通过，并去掉首尾空白", () => {
    expect(validateNoteBody("  周一交周报  ")).toEqual({
      ok: true,
      body: "周一交周报",
    });
  });

  it("空串与纯空白都拒绝", () => {
    expect(validateNoteBody("")).toEqual({
      ok: false,
      error: "便签内容不能为空",
    });
    expect(validateNoteBody("   \n\t  ").ok).toBe(false);
    // 全角空格（U+3000）骗不过 trim()
    expect(validateNoteBody("　　").ok).toBe(false);
  });

  it("1000 字通过，1001 字拒绝", () => {
    expect(validateNoteBody("字".repeat(NOTE_BODY_MAX_LENGTH)).ok).toBe(true);
    expect(validateNoteBody("字".repeat(NOTE_BODY_MAX_LENGTH + 1)).ok).toBe(
      false,
    );
  });

  it("按字符数计长度：一个汉字算 1，一个 emoji 也算 1", () => {
    expect(charLength("汉字")).toBe(2);
    expect(charLength("🙂")).toBe(1);
  });
});

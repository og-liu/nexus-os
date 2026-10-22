import { describe, expect, it } from "vitest";
import { TOAST_TEXT_MAX_CHARS, formatDeletedMessage } from "./format";

describe("删除成功提示的文案", () => {
  it("正常文案：`便签「正文」已删除`", () => {
    expect(formatDeletedMessage("便签", "服务器 8/20 到期，记得续费")).toBe(
      "便签「服务器 8/20 到期，记得续费」已删除",
    );
  });

  it("多行正文压成一行", () => {
    expect(formatDeletedMessage("便签", "第一行\n\n第二行   第三行")).toBe(
      "便签「第一行 第二行 第三行」已删除",
    );
  });

  it("超长按字符数截断并加省略号（一个汉字算 1）", () => {
    const long = "汉".repeat(TOAST_TEXT_MAX_CHARS + 6);
    const message = formatDeletedMessage("待办", long);
    expect(message).toBe(`待办「${"汉".repeat(TOAST_TEXT_MAX_CHARS)}…」已删除`);
    // 截断按字符算：汉字不会被劈成半个
    // 待办（2）+「（1）+ 正文（24）+ …（1）+ 」（1）+ 已删除（3）
    expect(Array.from(message).length).toBe(TOAST_TEXT_MAX_CHARS + 8);
  });

  it("刚好等于上限时不截断", () => {
    const exact = "字".repeat(TOAST_TEXT_MAX_CHARS);
    expect(formatDeletedMessage("便签", exact)).toBe(`便签「${exact}」已删除`);
  });

  it("正文为空时退化成「便签已删除」", () => {
    expect(formatDeletedMessage("便签", "")).toBe("便签已删除");
    expect(formatDeletedMessage("便签", "   \n  ")).toBe("便签已删除");
  });
});

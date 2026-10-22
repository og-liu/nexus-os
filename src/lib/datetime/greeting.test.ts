import { describe, expect, it } from "vitest";
import { greetingForHour } from "./greeting";
import { shanghaiParts } from "./shanghai";

/** 北京时间某一时刻。用带 `+08:00` 的 ISO 字符串构造，不依赖测试机时区。 */
function at(time: string): Date {
  return new Date(`2026-10-22T${time}:00+08:00`);
}

describe("问候词分档（按北京时间的小时）", () => {
  // 《功能/日期时间面板》§6 验收第 4 条点名的十个时刻，边界两侧各取一次
  it.each([
    ["05:59", "夜深了"],
    ["06:00", "早上好"],
    ["08:59", "早上好"],
    ["09:00", "上午好"],
    ["11:59", "上午好"],
    ["12:00", "中午好"],
    ["13:59", "中午好"],
    ["14:00", "下午好"],
    ["17:59", "下午好"],
    ["18:00", "晚上好"],
  ])("%s → %s", (time, expected) => {
    expect(greetingForHour(shanghaiParts(at(time)).hour)).toBe(expected);
  });

  it("午夜与深夜都算「夜深了」", () => {
    expect(greetingForHour(0)).toBe("夜深了");
    expect(greetingForHour(5)).toBe("夜深了");
  });

  it("一天最后一小时仍归「晚上好」", () => {
    expect(greetingForHour(23)).toBe("晚上好");
  });
});

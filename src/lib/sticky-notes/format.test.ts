import { describe, expect, it } from "vitest";
import { formatNoteTime } from "./format";

/**
 * 构造 UTC+8 墙上时间对应的毫秒时间戳。
 * 例：`utc8(2026, 10, 17, 9, 42)` = 北京时间 2026-10-17 09:42。
 */
function utc8(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): number {
  return Date.UTC(year, month - 1, day, hour, minute) - 8 * 60 * 60 * 1000;
}

describe("便签时间格式化（UTC+8，绝对日期时间）", () => {
  it("统一显示「YYYY-MM-DD HH:mm」", () => {
    expect(formatNoteTime(utc8(2026, 10, 17, 9, 42))).toBe("2026-10-17 09:42");
  });

  it("月 / 日 / 时 / 分补零", () => {
    expect(formatNoteTime(utc8(2026, 1, 2, 3, 4))).toBe("2026-01-02 03:04");
  });

  it("跨年也带完整年份", () => {
    expect(formatNoteTime(utc8(2025, 12, 30, 23, 5))).toBe("2025-12-30 23:05");
  });

  it("按 UTC+8 换算：UTC 16:30 显示为次日 00:30", () => {
    expect(formatNoteTime(Date.UTC(2026, 9, 16, 16, 30))).toBe(
      "2026-10-17 00:30",
    );
  });

  it("午夜边界：UTC 15:59 是当天 23:59", () => {
    expect(formatNoteTime(Date.UTC(2026, 9, 16, 15, 59))).toBe(
      "2026-10-16 23:59",
    );
  });
});

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

describe("便签时间格式化（UTC+8）", () => {
  it("今天显示「今天 HH:mm」", () => {
    expect(
      formatNoteTime(utc8(2026, 10, 17, 9, 42), utc8(2026, 10, 17, 20, 0)),
    ).toBe("今天 09:42");
  });

  it("昨天显示「昨天 HH:mm」", () => {
    expect(
      formatNoteTime(utc8(2026, 10, 16, 21, 15), utc8(2026, 10, 17, 10, 0)),
    ).toBe("昨天 21:15");
  });

  it("更早（同年）显示「M月D日」", () => {
    expect(
      formatNoteTime(utc8(2026, 8, 11, 10, 0), utc8(2026, 10, 17, 10, 0)),
    ).toBe("8月11日");
  });

  it("跨年显示「YYYY年M月D日」", () => {
    expect(
      formatNoteTime(utc8(2025, 12, 30, 10, 0), utc8(2026, 1, 1, 1, 0)),
    ).toBe("2025年12月30日");
  });

  it("日界按 +8 算：凌晨 0:30 看到的「昨晚 23:50」是昨天", () => {
    expect(
      formatNoteTime(utc8(2026, 10, 16, 23, 50), utc8(2026, 10, 17, 0, 30)),
    ).toBe("昨天 23:50");
  });

  it("正好 00:00 算「今天」的开始", () => {
    expect(
      formatNoteTime(utc8(2026, 10, 17, 0, 0), utc8(2026, 10, 17, 0, 0)),
    ).toBe("今天 00:00");
  });
});

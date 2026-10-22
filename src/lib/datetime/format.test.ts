import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDateKey,
  formatLunarDate,
  formatSolarDate,
  weekdayLabel,
} from "./format";
import { shanghaiMidnightMs, shanghaiParts } from "./shanghai";

describe("面板文字拼装", () => {
  it("公历日期：`10月22日星期四`（不带年份）", () => {
    expect(formatSolarDate({ year: 2026, month: 10, day: 22 })).toBe(
      "10月22日星期四",
    );
  });

  it("星期边界：周日写「星期日」，月初不补零", () => {
    expect(formatSolarDate({ year: 2026, month: 9, day: 20 })).toBe(
      "9月20日星期日",
    );
  });

  it("农历：月与日都用中文数字，闰月带「闰」字", () => {
    expect(formatLunarDate("九", "十三")).toBe("农历九月十三");
    expect(formatLunarDate("闰二", "初一")).toBe("农历闰二月初一");
  });

  it("时钟：24 小时制、逐位补零", () => {
    expect(formatClock({ hour: 13, minute: 37, second: 26 })).toBe("13:37:26");
    expect(formatClock({ hour: 9, minute: 5, second: 3 })).toBe("09:05:03");
    expect(formatClock({ hour: 0, minute: 0, second: 0 })).toBe("00:00:00");
  });

  it("日期键补零，可直接当字符串比较", () => {
    expect(formatDateKey({ year: 2026, month: 1, day: 2 })).toBe("2026-01-02");
  });

  it("weekdayLabel 与 Date 的星期一致（0 = 周日）", () => {
    expect(weekdayLabel(2026, 10, 22)).toBe("星期四");
    expect(weekdayLabel(2026, 10, 25)).toBe("星期日");
  });
});

describe("北京时间口径（Asia/Shanghai）", () => {
  it("午夜是 0 点，不是 24 点", () => {
    const parts = shanghaiParts(new Date("2026-10-22T00:30:00+08:00"));
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(30);
  });

  it("UTC 16:00 已经是北京次日 00:00（线上机器是 UTC，日界必须按东八区）", () => {
    const parts = shanghaiParts(new Date("2026-10-21T16:00:00Z"));
    expect([parts.year, parts.month, parts.day, parts.hour]).toEqual([
      2026, 10, 22, 0,
    ]);
  });

  it("UTC 15:59 仍是北京当天 23:59", () => {
    const parts = shanghaiParts(new Date("2026-10-21T15:59:00Z"));
    expect([parts.day, parts.hour, parts.minute]).toEqual([21, 23, 59]);
  });

  it("shanghaiMidnightMs 还原出来正是北京时间 00:00", () => {
    const parts = shanghaiParts(new Date(shanghaiMidnightMs(2026, 10, 22)));
    expect([parts.year, parts.month, parts.day, parts.hour, parts.minute]).toEqual(
      [2026, 10, 22, 0, 0],
    );
  });
});

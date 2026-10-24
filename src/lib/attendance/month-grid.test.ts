import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  buildMonthGrid,
  dayKeyOf,
  daysBetween,
  isDayKey,
  isSaturday,
  monthKey,
  parseDayKey,
  parseMonthKey,
  saturdayOfWeek,
  weekdayOf,
  weekdayShortLabel,
} from "./month-grid";

/**
 * 月历几何与日期算术的用例（《功能/出勤日历》§四「月历几何」、§七「42 格里本月日期算错」）。
 *
 * 重点覆盖三个容易翻车的边界：2 月（28 天、1 号是周日）、31 天的月、跨年。
 */
describe("buildMonthGrid", () => {
  it("永远 42 格，前补上月末、后补下月头", () => {
    const grid = buildMonthGrid(2026, 10);
    expect(grid).toHaveLength(42);
    // 2026-10-01 是周四 → 前面补 3 天（9/28 周一 ~ 9/30 周三）
    expect(grid[0].dayKey).toBe("2026-09-28");
    expect(grid[0].inMonth).toBe(false);
    expect(grid[3].dayKey).toBe("2026-10-01");
    expect(grid[3].inMonth).toBe(true);
    expect(grid[41].dayKey).toBe("2026-11-08");
    expect(grid[41].inMonth).toBe(false);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it("2 月：1 号是周日也不会出现「2 月 30 日」这种日期", () => {
    const grid = buildMonthGrid(2026, 2);
    expect(grid).toHaveLength(42);
    expect(grid[0].dayKey).toBe("2026-01-26");
    expect(grid[6].dayKey).toBe("2026-02-01");
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(28);
    expect(grid[41].dayKey).toBe("2026-03-08");
    // 每一格都是真实存在的日期
    for (const cell of grid) {
      expect(parseDayKey(cell.dayKey)).toEqual({
        year: cell.year,
        month: cell.month,
        day: cell.day,
      });
    }
  });

  it("跨年：12 月与次年 1 月的网格互相咬合", () => {
    const december = buildMonthGrid(2026, 12);
    expect(december[41].dayKey).toBe("2027-01-10");
    const january = buildMonthGrid(2027, 1);
    expect(january[0].dayKey).toBe("2026-12-28");
    expect(january[41].dayKey).toBe("2027-02-07");
  });

  it("连切 12 个月始终 42 格（行数不跟着月份变，页面高度才不跳）", () => {
    for (let month = 1; month <= 12; month += 1) {
      const grid = buildMonthGrid(2026, month);
      expect(grid).toHaveLength(42);
      expect(grid.filter((cell) => cell.inMonth).length).toBeGreaterThan(27);
      expect(grid.filter((cell) => cell.inMonth).length).toBeLessThan(32);
      expect(grid[0].dayKey < grid[41].dayKey).toBe(true);
    }
  });
});

describe("日期算术", () => {
  it("dayKey 与解析round-trip，非法日期被拒", () => {
    expect(dayKeyOf(2026, 3, 7)).toBe("2026-03-07");
    expect(parseDayKey("2026-03-07")).toEqual({ year: 2026, month: 3, day: 7 });
    expect(parseDayKey("2026-02-31")).toBeNull();
    expect(parseDayKey("2026-13-01")).toBeNull();
    expect(parseDayKey("2026-1-1")).toBeNull();
    expect(parseDayKey("")).toBeNull();
    expect(isDayKey("2026-10-24")).toBe(true);
    expect(isDayKey("2026-10-32")).toBe(false);
  });

  it("星期与中文短写", () => {
    expect(weekdayOf("2026-10-24")).toBe(6);
    expect(weekdayOf("2026-10-25")).toBe(0);
    expect(weekdayOf("2026-10-26")).toBe(1);
    expect(isSaturday("2026-10-24")).toBe(true);
    expect(isSaturday("2026-10-25")).toBe(false);
    expect(weekdayShortLabel("2026-10-24")).toBe("周六");
    expect(weekdayShortLabel("2026-10-25")).toBe("周日");
    expect(weekdayShortLabel("2026-10-26")).toBe("周一");
  });

  it("同周周六：周六是自己，周日回到前一天，周一是五天后", () => {
    expect(saturdayOfWeek("2026-10-24")).toBe("2026-10-24");
    expect(saturdayOfWeek("2026-10-25")).toBe("2026-10-24");
    expect(saturdayOfWeek("2026-10-26")).toBe("2026-10-31");
    expect(saturdayOfWeek("2026-10-30")).toBe("2026-10-31");
  });

  it("加减天数与相差天数（含负方向与跨年）", () => {
    expect(addDays("2026-10-24", 7)).toBe("2026-10-31");
    expect(addDays("2026-10-24", -7)).toBe("2026-10-17");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-10-31", "2026-10-24")).toBe(7);
    expect(daysBetween("2026-10-24", "2026-10-31")).toBe(-7);
    expect(daysBetween("2027-01-02", "2026-12-26")).toBe(7);
  });
});

describe("月份键", () => {
  it("月份键往返", () => {
    expect(monthKey(2026, 10)).toBe("2026-10");
    expect(parseMonthKey("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-1")).toBeNull();
    expect(parseMonthKey(undefined)).toBeNull();
  });

  it("加减月份跨年进位 / 借位", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
    expect(addMonths({ year: 2026, month: 10 }, -11)).toEqual({
      year: 2025,
      month: 11,
    });
    expect(addMonths({ year: 2026, month: 10 }, 12)).toEqual({
      year: 2027,
      month: 10,
    });
  });
});
